# AGENTS.md

Workspace-level guidance for coding agents in the `temple-era` monorepo.

This is the canonical instruction file — **edit this one**. `CLAUDE.md` beside it
is a one-line `@AGENTS.md` import and holds no content of its own, because Claude
Code reads `CLAUDE.md` rather than `AGENTS.md`. Never put instructions in a
`CLAUDE.md`: they would be invisible to every other agent.

## ⚠️ Read the app-level file too

Each app has its own `AGENTS.md` with rules that apply only inside it:

- **`apps/web/AGENTS.md`** — Next.js app: architecture, tRPC/Drizzle, API surface, DB schema
- **`apps/bot/AGENTS.md`** — Discord bot: handlers, gateway behaviour, Discord.js patterns

Nested files load *lazily* — only once a file in that subtree is read. So when you
start working in `apps/web` or `apps/bot`, **read that app's `AGENTS.md` first**
rather than relying on it having been picked up. If you are touching both apps,
read both.

**Maintenance Rule**: changes to workspace layout, root tooling, or cross-app
contracts belong in this file. App-specific changes belong in the app's own
`AGENTS.md`.

## What this repo is

A pnpm + Turborepo workspace holding two previously separate applications, both histories preserved:

| Path | Package | Deploys to |
|---|---|---|
| `apps/web` | Next.js 15 web app — the database owner and every API surface. Live at [temple-era.com](https://www.temple-era.com) | **Vercel** |
| `apps/bot` | Discord gateway bot — a thin client over five `/api/discord/*` endpoints the web app owns | **Northflank** (Docker) |
| `packages/contracts` | `@temple-era/contracts` — Zod schemas for the `/api/discord/*` wire contract, imported by both apps | — (compiled into each) |
| `packages/wcl` | `@temple-era/wcl` — Warcraft Logs URL and report-ID parsing, imported by both apps | — (compiled into each) |

The two apps deploy independently to different platforms. Nothing in this repo couples their release cycles.

## Shared packages must be compiled

Anything in `packages/` is consumed as **built output** (`dist/`), never as raw TypeScript.
This is not a style preference — the two apps disagree on module resolution:

| App | `module` | `moduleResolution` | Emits |
|---|---|---|---|
| `apps/web` | `ESNext` | `Bundler` | `noEmit` |
| `apps/bot` | `Node16` | `Node16` | `dist/` |

The usual raw-source internal package works for Next.js via `transpilePackages` but **silently
breaks the bot**, whose `tsc -p tsconfig.prod.json` emits only `src/`. So a shared package must:

- compile with `tsc` to `dist/`, and set `"type": "module"`
- expose an `exports` map with both `types` and `default`
- use **`.js`-suffixed relative imports** in its own source — required by `Node16`, accepted by
  `Bundler`

Four consequences that are easy to miss:

1. **Give the package a `prepare` script that compiles it.** pnpm runs `prepare` for every
   workspace project on `pnpm install`, and that is the *only* thing that builds `dist/` on
   Vercel. Vercel's Root Directory is `apps/web`, so its Build Command's `pnpm build` resolves
   to that app's `next build` — **not** the root turbo task — and nothing else in the pipeline
   would compile the package. Without `prepare` the deploy fails with
   `Module not found: Can't resolve '@temple-era/contracts'`.
2. **Declare the dependency in the consuming app's `package.json`.** Vercel's Skip Deployments
   reads the workspace graph; an undeclared import means web builds get skipped when only the
   package changes.
3. **Add the manifest to `apps/bot/Dockerfile`** (one `COPY` line per package — a glob would
   flatten them into one directory) and make sure the build step filters with `{./apps/bot}...`.
   The braces are load-bearing: `"./apps/bot..."` parses as a plain path and silently selects
   the bot alone. The Docker install runs `--ignore-scripts`, so `prepare` does **not** cover
   this one.
4. **Build packages before the per-app steps in CI.** Both app jobs invoke each app's script
   directly rather than going through turbo, so nothing else honours `^build`. `prepare` also
   covers this, but the explicit step keeps the dependency visible and survives anyone adding
   `--ignore-scripts` to the install.

Background: `docs/monorepo-migration-plan.md` **R3**.

## Commands

Run from the repo root; Turborepo fans out to both apps and caches aggressively.

```bash
pnpm install          # install the whole workspace
pnpm build            # build both apps    ⚠️ see warning below
pnpm typecheck        # tsc --noEmit in both apps
pnpm lint             # oxlint across both apps
pnpm test             # vitest across apps/web, apps/bot and packages/wcl
pnpm format:fix       # oxfmt across both apps
```

Everyday commands work from the root without filters:

```bash
pnpm dev              # web dev server (the common case)
pnpm dev:bot          # bot with hot reload
pnpm dev:all          # both at once via Turborepo
pnpm db:studio        # any db:* script — all forward to apps/web
pnpm db:clone-prod
```

`db:*` scripts are web-only passthroughs: there is one database and `apps/web`
owns it. `dev` deliberately means *web only* — `dev:all` starts both, which is
rarely what you want.

For a script with no root alias, there are short prefixes rather than
hand-typing the package name (note it is `temple-era-web`, singular "raid",
inherited from the original repo and easy to typo):

```bash
pnpm web preview          # = pnpm --filter temple-era-web preview
pnpm bot start            # = pnpm --filter temple-era-bot start
```

### Database migrations are NOT part of `build`

`pnpm build` compiles only. Migrations run through an explicit script:

```bash
pnpm --filter temple-era-web db:deploy    # drizzle-kit migrate + kill idle connections
```

This was split apart during the monorepo migration (Phase 2). Previously it lived in the
web app's `postbuild`, which meant every `git push` — via the pre-push build hook — ran
migrations against a real database.

> ⛔ **Deployment consequence.** Because `build` no longer migrates, any deploy pipeline
> must call `db:deploy` itself. The Vercel Build Command must be:
>
> ```bash
> pnpm build && pnpm --filter temple-era-web db:deploy
> ```
>
> If it isn't, deploys will ship code against an un-migrated database and fail silently at
> runtime rather than at build time.

`drizzle-kit migrate` emits PostgreSQL `NOTICE` lines ("schema already exists, skipping").
Those are **not errors** — check the exit code, not the output.

## Toolchain

Single versions, pinned at root. Do not re-declare these in an app manifest.

- **Node** `>=22.0.0 <23.0.0` (`.nvmrc` → 22.19.0), **pnpm** `9.15.1` via `packageManager`
- `engine-strict=true` in `.npmrc` — a wrong Node version fails the install rather than shipping a mismatch
- **oxlint + oxfmt** for both apps, configured by the root `.oxlintrc.json`. The bot was migrated off ESLint + Prettier in Phase 2.
- **lefthook** is the only git hook manager. The bot's husky setup was removed — if you reintroduce husky, the two will fight over `.git/hooks` and one will silently stop running.
- **Turborepo** task graph in `turbo.json`

`.git-blame-ignore-revs` lists the bulk oxfmt reformat. Enable it locally:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Secrets — Doppler is the source of truth

**Both apps get their secrets from Doppler.** There is no root `.env`, and
`apps/web` has no `.env` at all.

**One project, `temple-era`, for both apps.** Values shared between web and bot —
`TEMPLE_WEB_API_TOKEN`, `DISCORD_BOT_TOKEN`, `DISCORD_RAID_LOGS_CHANNEL_ID` —
exist once, so they cannot drift. They previously lived in two projects and did.

| Config | Feeds |
|---|---|
| `dev` | local development for both apps (`doppler run`) |
| `stg` | Vercel **Preview** (native Doppler sync) |
| `prd` | Vercel **Production** (native sync) **and** the Northflank secret group (via GitHub Action) |

`NORTHFLANK_ACCESS_TOKEN` is deliberately **not** in Doppler — it is CI
infrastructure rather than app config, so it lives as a plain GitHub repo secret
and never syncs into Vercel.

### First-time setup

```bash
doppler login                                    # browser, GitHub SSO
cd apps/web && doppler setup --no-interactive    # reads doppler.yaml
cd ../bot  && doppler setup --no-interactive     # same project, same config
```

Nothing to obtain from a teammate. Then use the Doppler-backed scripts:

```bash
pnpm dev:doppler      # web dev server with secrets injected
pnpm db:studio        # (and every other db:* script)
```

### Why the two apps differ

Locally they behave identically: both run under `doppler run` and neither has a
`.env`.

They differ only in **how production gets its secrets**. Vercel has a native
Doppler integration and syncs automatically. **Northflank has none**, so
`apps/bot`'s two secret-group values are pushed by
`.github/workflows/sync-bot-secrets.yml` on deploy.

The bot's container has no Doppler dependency — it reads plain environment
variables from Northflank, so a Doppler outage cannot prevent it from starting.

### Adding a variable

1. Update the schema in `apps/web/src/env.js` (web) or `apps/bot/src/config/env.ts` (bot)
2. Add it to `apps/web/.env.example` or `apps/bot/env.example` — those stay as
   documentation of what each variable is for, which Doppler's UI does not capture
3. Set it in **every** Doppler config it applies to (`dev`, `stg`, `prd`). A value
   used by both apps is set once and both get it — that is the point of the single
   project.

Do not create a local `.env` for `apps/web`. It still works — Next.js loads it —
which is exactly the problem: the value then silently diverges from Doppler for
everyone else.

> **Never seed Doppler from `vercel env pull`.** It returns the literal string
> `[SENSITIVE]` for variables of type `sensitive`, which then syncs back to Vercel
> as though it were the real value. This corrupted four production secrets during
> the migration. Always assert that no value equals `[SENSITIVE]` after an import.

Three variables must agree across apps:

| Variable | Constraint |
|---|---|
| `TEMPLE_WEB_API_TOKEN` | Identical in `apps/web`, `apps/bot`, **and the external Templar bot**. Changing it is a three-way breaking change. |
| `DISCORD_BOT_TOKEN` | Same bot identity in both apps |
| `API_BASE_URL` (bot) | Must equal `NEXT_PUBLIC_APP_URL` (web) |

## Hard constraint: Templar

A third bot — separate from this repo, and **not** joining it — consumes `/api/v1/*` and `/api/discord/proxy/[discordId]` using the same `TEMPLE_WEB_API_TOKEN`.

**Never change the v1 REST wire formats, the proxy route, the OpenAPI spec (`apps/web/src/lib/openapi-registry.ts`), or the meaning of `TEMPLE_WEB_API_TOKEN`** without treating it as a breaking change to an external consumer you cannot see. This is a release gate, not a guideline.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`.

A `changes` job uses `dorny/paths-filter` to decide which app jobs run:

| Changed | Runs |
|---|---|
| `apps/web/**` | web job only |
| `apps/bot/**` | bot job only |
| `packages/**`, `pnpm-lock.yaml`, `package.json`, `turbo.json`, `.oxlintrc.json`, `.nvmrc`, `.npmrc`, `ci.yml` | **both** |

- **web**: lint → typecheck → test → build. Runs with `SKIP_ENV_VALIDATION=1` and **no database credentials** — possible only because `build` no longer migrates (see above). Vercel does the real env validation.
- **bot**: lint → typecheck → build → verify `dist/index.js` exists → import the built entrypoint to prove every module resolves. That last check matters because the bot uses `Node16` resolution with mandatory `.js` import extensions and `tsc` emits only `src/`, so a missing runtime dependency does not surface at build time.

A final `ci` job aggregates both and is the intended **required status check** for branch protection — it stays green when a job is legitimately skipped by the path filter, but fails if either actually fails. Do not mark `web` or `bot` required directly; a skipped job would block the PR forever.

`.github/workflows/discord-pr-notification.yml` announces merged PRs carrying the `user-facing` label. It derives a title prefix from the changed paths (`Website` / `Bot` / `Website + Bot` / `Repo`) so a bot PR is not announced as a website change.

## Git conventions

These apply repo-wide; the app-level `AGENTS.md` files defer to this section.

**Never commit directly to `main`.** Branch names: `{type}/{kebab-description}` where type is `feature`, `fix`, `chore`, `refactor`, `hotfix`, `dev`, or `claude`. Enforced by the lefthook pre-push hook.

Commits: `type(scope): description` — types `feat`, `fix`, `chore`, `refactor`, `hotfix`, `dev`. Enforced by `.lefthook/commit-msg/commit-msg.sh`.

**Scope commits to the app you touched**, since a reader cannot tell from the type alone:

| Changed | Scope | Example |
|---|---|---|
| `apps/web/**` only | feature area | `feat(raids): add attendance export` |
| `apps/bot/**` only | prefix with `bot/` | `fix(bot/handler): resolve thread parsing` |
| `packages/**` | package name | `feat(contracts): add proxy request schema` |
| Both, or root config | `repo` | `chore(repo): bump turbo` |

### Shipping

Say **"ship it"** to invoke `/ship` (`.claude/commands/ship.md`): branch, commit,
push, open the PR with the right label, then hand off to `/fix-pr`.

`/fix-pr` (`.claude/commands/fix-pr.md`) waits for **Greptile**, the AI reviewer
that comments on every PR, applies the feedback worth applying, pushes, and
repeats until the confidence score hits 5/5 or five rounds elapse. It can be run
on its own against an existing PR.

**Its waits run in the background.** Greptile takes 3–8 minutes per round; the
loop must not block the session. Ask about status any time — it reads the
pending task rather than starting a second poll.

**Merging is not automatic.** `/fix-pr` stops with the PR ready and asks. To
authorize it up front, say so explicitly — "ship it and merge when ready",
"merge when clear", "merge if it looks good" — which permits merging **only** at
5/5.

Greptile's feedback is advice, not instruction: fixes that are wrong or
out-of-scope should be skipped and the reasoning reported.

## Where to look next

- `docs/monorepo-migration-plan.md` — the migration this repo is the product of. Phases 3–7 are still open; the risk register (**R1**–**R10**) explains why several things here look the way they do.
- `docs/followups/legacy-access-booleans-cleanup.md` — what still has to happen before `isRaidManager` can leave the `/api/discord/check-permissions` response
- `apps/web/AGENTS.md` — web architecture, tRPC/Drizzle patterns, API surface, database schema
- `apps/bot/AGENTS.md` — bot handlers, Discord.js patterns, gateway behaviour
