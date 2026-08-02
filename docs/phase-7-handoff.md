# Phase 7 handoff

**Phase 7 is complete.** All three remaining work items shipped together on one
branch; what each one turned up is recorded under "Work items" below.

This file is kept because the constraints, verification steps and hard-won
gotchas below are not Phase 7 specific — they apply to any change in this repo,
and several are not discoverable from the code.

---

You are working in `khlav/temple-era`, a pnpm + Turborepo monorepo with two
deployed apps. **Read `AGENTS.md` at the root first**, then `apps/web/AGENTS.md`
or `apps/bot/AGENTS.md` for whichever app you touch.

Say "ship it" to use `/ship`, which opens a PR and hands off to `/fix-pr` for the
Greptile review loop. **Do not merge without explicit authorization from the
user.**

## Environment setup (do this first)

Secrets come from Doppler; there are no `.env` files.

```bash
pnpm install
doppler login                                     # browser
cd apps/web && doppler setup --no-interactive     # project temple-era, config dev
cd ../bot  && doppler setup --no-interactive
```

Commands that need secrets must run under Doppler:

```bash
pnpm dev:doppler                                   # web dev server
pnpm dev:bot                                       # bot, already Doppler-wrapped
pnpm --filter temple-era-web exec doppler run -- pnpm exec next build
```

`pnpm build` alone fails env validation by design. For a compile-only check use
`SKIP_ENV_VALIDATION=1 pnpm build` — that flag is declared in `turbo.json` as
`globalPassThroughEnv` because Turborepo 2.x runs in `strict` env mode and would
otherwise filter it before the task sees it.

## Hard constraints

**1. Shared packages must be COMPILED, not raw TypeScript.** The apps disagree on
module resolution:

| App | `module` | `moduleResolution` | Emits |
|---|---|---|---|
| `apps/web` | `ESNext` | `Bundler` | `noEmit` |
| `apps/bot` | `Node16` | `Node16` | `dist/` |

A raw-`.ts` internal package works for Next.js via `transpilePackages` but fails
for the bot, whose `tsc -p tsconfig.prod.json` emits only `src/`.

**Copy `packages/contracts` exactly** — it is the working reference: `tsc` to
`dist/`, `"type": "module"`, an `exports` map with `types` + `default`, and
`.js`-suffixed relative imports in its own source.

**2. Declare the dependency in every consuming app.** Vercel's Skip Deployments
reads the workspace graph. An undeclared dependency means Vercel **skips web
builds** when only the package changes — a silent staleness bug. Both apps
already list `"@temple-era/contracts": "workspace:*"`; do the same for new
packages.

**3. Update `apps/bot/Dockerfile`.** It copies package manifests explicitly:

```dockerfile
COPY packages/contracts/package.json packages/contracts/
```

Add a line for each new package, or the Docker build fails on a missing manifest.
**CI cannot catch this** — verify locally with `docker build -f apps/bot/Dockerfile .`

**4. Never change the `/api/v1/*` wire format.** An external bot, **Templar**,
consumes it with the shared `TEMPLE_WEB_API_TOKEN` and cannot be updated in
lockstep. Verify before and after:

```bash
./scripts/verify-deployment.sh https://www.temple-era.com
```

`docs/baselines/openapi-v1-prod.json` must stay byte-identical. Regenerating it
to make a check pass defeats its purpose.

**5. Never put a package name in an external build command.** `pnpm --filter
<unknown-name>` prints a warning and **exits 0**, so a stale name is a green build
that does nothing. `.github/scripts/check-filters.mjs` enforces this in CI.

## Work items — all three complete

Shipped together on one branch rather than three PRs. Recorded here because each
one turned up something the original plan had wrong.

### 1. `packages/wcl` — deduplicate WCL parsing ✅

**There were three copies, not two, and the plan named the wrong web file.**
`apps/web/src/server/api/wcl-helpers.ts` contains no URL parsing at all — it does
WCL GraphQL calls and report shaping. The actual copies were:

- `apps/bot/src/services/wclDetector.ts` (now deleted)
- `apps/web/src/server/api/discord-helpers.ts`
- `apps/web/src/components/raids/discord-warcraft-logs.tsx`

Tests written before consolidating found **three** divergences, not the one the
plan anticipated. `packages/wcl/README.md` records each and how it was resolved.
Beyond the expected subdomain drift, the web copy's greedy `.*` suffix made the
clickable-link renderer swallow trailing prose into the anchor, and *both* copies
silently truncated a 17-character report code to a nonexistent 16-character ID.

### 2. Bot tests ✅

Vitest added, mirroring `apps/web`. Suites cover `benchParser.ts` and
`utils/messageDeduplication.ts`; WCL parsing is tested in `packages/wcl` instead,
since `wclDetector.ts` no longer exists. `tsconfig.prod.json` excludes tests from
the emit so they do not ship in the Docker image.

Two findings recorded in tests rather than fixed, both being behaviour changes
rather than test coverage:

- `MessageDeduplicator` has **no size cap**. It is bounded by arrival rate over
  the timeout window. `apps/bot/AGENTS.md` called it an "LRU cache"; it is not one.
- `add()` after `destroy()` silently resumes tracking with no cleanup interval.

### 3. Bot logging: winston → pino ✅

Both required behaviours preserved and verified by running the code:
`handleExceptions` / `handleRejections` became explicit `uncaughtException` /
`unhandledRejection` handlers that log at `fatal` and exit 1 (winston's
`exitOnError` default), and `isoTime` replaces pino's epoch-millisecond default
so the startup lines stay human-readable in Northflank.

**The trap was the call-site argument order.** winston takes `(message, meta)`,
pino takes `(meta, message)`, and pino does not error on the winston order — it
silently drops the metadata. All 41 two-argument call sites had to be flipped.
Anyone adding a log line should read the argument-order note in
`apps/bot/AGENTS.md` first.

## Verification

Per PR, from the repo root:

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test
SKIP_ENV_VALIDATION=1 pnpm build
```

Touching the bot, also:

```bash
docker build -f apps/bot/Dockerfile -t temple-bot .
```

Touching web routes or the API surface, run `scripts/verify-deployment.sh` against
the preview deployment before merging. It needs `VERCEL_AUTOMATION_BYPASS_SECRET`
(previews sit behind Vercel auth) and `~/.temple-era-token`; both are already on
the machine.

## Repo conventions

- `main` is protected: PR required, aggregate `CI` check must pass, branch must be
  current (`strict: true` — use `gh pr update-branch` if blocked)
- Commit format `type(scope): description`, types
  `feat|fix|chore|refactor|hotfix|dev` — **no `docs`**, use `dev`. Scope bot
  changes as `bot/...`
- Merge with `--squash` unless the branch contains a commit whose SHA is
  referenced (e.g. `.git-blame-ignore-revs`)
- Package names are `temple-era-web`, `temple-era-bot`, `@temple-era/contracts`

## Things that have bitten before

Read these; each cost real time.

- **`pnpm --filter <unknown>` exits 0.** A stale package name is a silent no-op.
- **Turborepo `strict` env mode** filters variables not declared in `turbo.json`.
- **`vercel env pull` returns the literal `[SENSITIVE]`** for sensitive-type
  variables. Seeding anything from it corrupted four production secrets. Always
  assert no value equals `[SENSITIVE]`.
- **GitHub environment secrets outrank repo secrets** of the same name, so a stale
  environment copy silently shadows a live one.
- **The Northflank CLI needs a login context**, not just `NORTHFLANK_ACCESS_TOKEN`.
  A dev machine has one from an earlier `northflank login`, which makes the env var
  look sufficient when it isn't. Test in a clean `HOME` before concluding anything
  about CI.
- **Guard code is where the bugs are.** Nearly every defect found during this
  migration was in code that only runs on the failure path — it was never
  exercised until deliberately broken. Test the failure branch, not just the happy
  one.
