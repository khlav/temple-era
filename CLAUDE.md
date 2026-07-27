# CLAUDE.md

Workspace-level guidance for Claude Code (claude.ai/code) in the `temple-era` monorepo.

**Maintenance Rule**: When making changes that affect the workspace layout, root tooling, or cross-app contracts, update this file. App-specific changes belong in `apps/web/CLAUDE.md` or `apps/bot/CLAUDE.md` — nested `CLAUDE.md` files are read automatically when you work in those directories.

## What this repo is

A pnpm + Turborepo workspace holding two previously separate applications, both histories preserved:

| Path | App | Deploys to |
|---|---|---|
| `apps/web` | Next.js 15 web app — the database owner and every API surface. Live at [temple-era.com](https://www.temple-era.com) | **Vercel** |
| `apps/bot` | Discord gateway bot — a thin client over five `/api/discord/*` endpoints the web app owns | **Northflank** (Docker) |
| `packages/` | Empty until Phase 7. See `docs/monorepo-migration-plan.md` **R3** before adding anything here. | — |

The two apps deploy independently to different platforms. Nothing in this repo couples their release cycles.

## Commands

Run from the repo root; Turborepo fans out to both apps and caches aggressively.

```bash
pnpm install          # install the whole workspace
pnpm build            # build both apps    ⚠️ see warning below
pnpm typecheck        # tsc --noEmit in both apps
pnpm lint             # oxlint across both apps
pnpm test             # vitest (web only today; bot has no suite yet)
pnpm format:fix       # oxfmt across both apps
```

Target a single app with `--filter`:

```bash
pnpm --filter temple-raid-t3 dev              # web dev server
pnpm --filter temple-raids-discord-bot dev    # bot with hot reload
```

### Database migrations are NOT part of `build`

`pnpm build` compiles only. Migrations run through an explicit script:

```bash
pnpm --filter temple-raid-t3 db:deploy    # drizzle-kit migrate + kill idle connections
```

This was split apart during the monorepo migration (Phase 2). Previously it lived in the
web app's `postbuild`, which meant every `git push` — via the pre-push build hook — ran
migrations against a real database.

> ⛔ **Deployment consequence.** Because `build` no longer migrates, any deploy pipeline
> must call `db:deploy` itself. The Vercel Build Command must be:
>
> ```bash
> pnpm build && pnpm --filter temple-raid-t3 db:deploy
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

## Environment variables — do not hoist

**Each app keeps its own `.env`.** There is deliberately no root `.env`.

The web app validates its environment at build time via `@t3-oss/env-nextjs` and throws on anything missing; the bot uses a bare `dotenv.config()` with its own required list. A merged root `.env` would make each app's failure mode depend on the other's variables. See `apps/*/.env.example` (web) and `apps/bot/env.example`.

Three variables must agree across apps:

| Variable | Constraint |
|---|---|
| `TEMPLE_WEB_API_TOKEN` | Identical in `apps/web`, `apps/bot`, **and the external Templar bot**. Changing it is a three-way breaking change. |
| `DISCORD_BOT_TOKEN` | Same bot identity in both apps |
| `API_BASE_URL` (bot) | Must equal `NEXT_PUBLIC_APP_URL` (web) |

## Hard constraint: Templar

A third bot — separate from this repo, and **not** joining it — consumes `/api/v1/*` and `/api/discord/proxy/[discordId]` using the same `TEMPLE_WEB_API_TOKEN`.

**Never change the v1 REST wire formats, the proxy route, the OpenAPI spec (`apps/web/src/lib/openapi-registry.ts`), or the meaning of `TEMPLE_WEB_API_TOKEN`** without treating it as a breaking change to an external consumer you cannot see. This is a release gate, not a guideline.

## Git conventions

These apply repo-wide; the app-level `CLAUDE.md` files defer to this section.

**Never commit directly to `main`.** Branch names: `{type}/{kebab-description}` where type is `feature`, `fix`, `chore`, `refactor`, `hotfix`, `dev`, or `claude`. Enforced by the lefthook pre-push hook.

Commits: `type(scope): description` — types `feat`, `fix`, `chore`, `refactor`, `hotfix`, `dev`. Enforced by `.lefthook/commit-msg/commit-msg.sh`.

**Scope commits to the app you touched**, since a reader cannot tell from the type alone:

| Changed | Scope | Example |
|---|---|---|
| `apps/web/**` only | feature area | `feat(raids): add attendance export` |
| `apps/bot/**` only | prefix with `bot/` | `fix(bot/handler): resolve thread parsing` |
| Both, or root config | `repo` | `chore(repo): bump turbo` |

Say "ship it" to invoke `/ship` (`.claude/commands/ship.md`), which handles branching, committing, pushing, and PR creation including the `user-facing` label.

## Where to look next

- `docs/monorepo-migration-plan.md` — the migration this repo is the product of. Phases 3–7 are still open; the risk register (**R1**–**R10**) explains why several things here look the way they do.
- `apps/web/CLAUDE.md` — web architecture, tRPC/Drizzle patterns, API surface, database schema
- `apps/bot/CLAUDE.md` — bot handlers, Discord.js patterns, gateway behaviour
