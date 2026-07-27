# Handoff: Build the `temple-era` monorepo from two existing repos

**Audience:** a local coding agent with push access to `khlav/*` and a working `pnpm` + Docker + `git-filter-repo` toolchain. Written to be executed without prior context.

**Note on location:** this doc originated in `temple-raids-t3`, was carried into `apps/web/docs/` by the Phase 1 graft, and was moved here to the monorepo root in Phase 2. It now lives at its final location.

**Note on the repo name:** the new repo was created as **`khlav/temple-era`** (public, to satisfy Vercel's free-tier requirement), not `khlav/temple-raids` as originally drafted. All references below have been updated. References to `temple-raids-t3` and `temple-raids-discord-bot` still mean the two original source repos.

**Steps are tagged `[AGENT]` (do it) or `[HUMAN]` (stop and hand back).** Never attempt a `[HUMAN]` step — they are dashboard/console actions with production consequences.

---

## 1. Context

Two repos are already coupled, but nothing enforces the coupling:

- **`khlav/temple-raids-t3`** — Next.js 15 web app (T3 stack: tRPC, Drizzle, NextAuth), live at `temple-era.com` on **Vercel**. Owns the database and every API surface.
- **`khlav/temple-raids-discord-bot`** — a Discord gateway client, 13 source files, running on **Northflank** as a Docker container. It is a thin client over five endpoints the web app owns: `/api/discord/{check-permissions,create-raid,update-raid,update-bench,proxy}`.

The contract between them is enforced by nothing. The bot hand-declares `interface PermissionCheckResult` in `src/services/permissionChecker.ts`; the web handlers do `const { discordUserId, wclUrl } = await request.json()` with an ad-hoc regex (`src/app/api/discord/create-raid/route.ts`). Either side can ship independently and break the other silently at runtime.

**Goal:** one new repo, `khlav/temple-era`, as a pnpm + Turborepo workspace with `apps/web` and `apps/bot`, both histories preserved. Deployments stay exactly where they are — Vercel for web, Northflank for the bot. Shared typed contracts follow in Phase 7.

**Why a new repo helps:** the entire restructure happens in a repo nothing deploys from. Production is untouched until Phase 4, and cutover is two independent dashboard changes, each individually revertible by pointing back at the old repo.

### Hard constraint: Templar

A third bot — separate, Hermes/openclaw-style — consumes `/api/v1/*` and `/api/discord/proxy/[discordId]` **using the same `TEMPLE_WEB_API_TOKEN` as the log-monitoring bot**. It is not joining this monorepo.

Therefore, **at no point in this migration may the v1 REST surface, the proxy route, the OpenAPI spec (`src/lib/openapi-registry.ts`), or the value/semantics of `TEMPLE_WEB_API_TOKEN` change.** Phase 7's contracts package must not alter any wire format. Treat this as a release gate, not a guideline.

### Decisions already made
- Layout: `apps/web` + `apps/bot`.
- Turborepo: yes.
- New repo `khlav/temple-era`; both old repos **archived, never deleted**.
- Templar stays external.

---

## 2. Source state

| | `temple-raids-t3` → `apps/web` | `temple-raids-discord-bot` → `apps/bot` |
|---|---|---|
| Size | 11 MB `.git`, 50 commits | 364 KB `.git`, 77 commits, 13 files |
| Node / pnpm | `>=22 <23`, `.nvmrc` 22.19.0, pnpm 9.15.1, `engine-strict=true` | `>=18`; CI Node 18 + pnpm 8 |
| Lint / format | oxlint + oxfmt | ESLint 9 + Prettier 3 |
| Hooks | **lefthook** | **husky** + lint-staged |
| TS | `moduleResolution: Bundler`, `noEmit` | `Node16`, **mandatory `.js` import extensions**, emits `dist/` |
| Logging | pino | winston (dev) / hand-rolled console shim (prod) |
| Tests | Vitest, 1 suite (`src/lib/__tests__/aa-template.test.ts`) | none |
| Deploy | Vercel, root dir `.`, `postbuild` runs `drizzle-kit migrate` | Northflank, Docker `node:18-alpine`, root `Dockerfile` |
| CI | `discord-pr-notification.yml` | same file (near-duplicate) + `build-test.yml` |

Keep at repo root from the web repo: `.claude/`, `.agent/`, `.oxlintrc.json`, `.npmrc`, `.nvmrc`, `lefthook.yml`, `.lefthook/`.

---

## 3. Target layout

```
temple-raids/
├── apps/
│   ├── web/          # all of temple-raids-t3, unchanged content
│   │   ├── src/ public/ drizzle/ scripts/ docs/
│   │   ├── next.config.js drizzle.config.ts tailwind.config.ts
│   │   ├── vitest.config.ts components.json
│   │   ├── package.json tsconfig.json .gitignore .env.example CLAUDE.md
│   └── bot/          # all of temple-raids-discord-bot, unchanged content
│       ├── src/
│       ├── Dockerfile          # rewritten in Phase 5
│       ├── package.json tsconfig.json tsconfig.prod.json .gitignore CLAUDE.md
├── packages/         # empty until Phase 7
├── .github/workflows/
├── .lefthook/  lefthook.yml  .oxlintrc.json  .npmrc  .nvmrc
├── pnpm-workspace.yaml  pnpm-lock.yaml  turbo.json
├── package.json      # private, scripts only
├── .gitignore        # written fresh — see R1
├── .cursorrules  CLAUDE.md
```

---

## 4. Risks — read before executing

### R1. Merging the two `.gitignore` files untracks `apps/web/public` — **critical**
The bot's `.gitignore` contains bare `public` and `dist` entries (Gatsby/Nuxt template leftovers). Bare patterns match at any depth, so a concatenated root file starts ignoring `apps/web/public/`, which holds committed images.

**Do:** write a minimal root `.gitignore` (`node_modules`, `.env*`, `.DS_Store`, `*.tsbuildinfo`, `.turbo`, `.vercel`) and move each repo's existing file **into its app directory unchanged**. Nested files anchor leading-`/` patterns to their own directory, which also repairs web's `/.next/`, `/node_modules`, `/scripts/*.ts` — those silently stop matching once code moves down a level.

Web's `.gitignore` also picked up a `/backups/` entry (2026-07) — `pnpm db:clone-prod` and prod restore dumps land there, and they contain emails, Discord IDs, and API token hashes. Preserve it in the merge; it's the same class of risk as the tracked-vs-ignored mismatches above, just in the other direction (must stay ignored).

### R2. husky and lefthook both claim `.git/hooks`
Last `prepare` to run wins; the other's checks silently stop. **Do:** delete `.husky/`, drop `husky` + `lint-staged` from the bot's `package.json`, remove its `prepare` script. Only root `package.json` gets `"prepare": "lefthook install"`.

### R3. Module-resolution mismatch will break the first shared package
Web uses `Bundler` + bare specifiers; the bot uses `Node16`, which **requires `.js` extensions** and honours `exports` strictly. The usual "raw `.ts` internal package" pattern works for Next (`transpilePackages`) but **fails for the bot**, whose `tsc -p tsconfig.prod.json` emits only `src/`.

**Do:** nothing in Phases 1–6 — keep `packages/` empty so this risk stays dormant. In Phase 7, shared packages are **compiled** (`tsc` → `dist/`, `type: module`, `exports` map with `types` + `default`), authored with `.js`-suffixed relative imports, which both resolvers accept.

### R4. Bot would be built on Node 22 and run on Node 18
Its `engines: >=18.0.0` is satisfied by 22, so install won't fail — it just ships a build/runtime mismatch. **Do:** bump to `>=22.0.0 <23.0.0` and `node:22-alpine` in Phase 2/5. One `packageManager: pnpm@9.15.1` at root only.

### R5. Lockfile is regenerated, not merged
pnpm dedupes across the workspace, so the bot's transitives (`discord.js` → `undici`/`ws`, `winston` → `logform`) may resolve differently than today. **Do:** regenerate, then diff the bot's tree against the old repo and smoke-test on a test Discord server before Phase 5.

### R6. GitHub metadata does not transfer to a new repo — **new-repo-specific**
Issues, PR history and review threads, labels, Actions secrets, branch protection, collaborators, and webhooks do **not** come along. **Do:** recreate secrets (`DISCORD_WEBHOOK_URL` at minimum), the `user-facing` label, branch protection on `main`, and the PR template. Archive both old repos so every existing PR/commit link keeps resolving. `[HUMAN]`

### R7. Vercel — repoint, don't recreate
The existing project holds the `temple-era.com` domain, all env vars, and `DATABASE_URL`. Its `postbuild` runs `drizzle-kit migrate` against **production**. A fresh project with a hand-retyped `DATABASE_URL` is a live-data hazard.

**Do:** change the connected Git repo on the **existing** project (Settings → Git), then set Root Directory → `apps/web`, enable *"Include source files outside of the Root Directory"*, and set Ignored Build Step → `npx turbo-ignore`. Without that last one, every bot commit triggers a production migration. `[HUMAN]`

Since repointing carries the existing env vars over rather than recreating them, this is also where a newly-added var like `SUPERADMIN_DISCORD_IDS` (2026-07, Production + Preview — env-derived break-glass superadmin access, no DB row) survives for free. If R7's approach ever changes to "recreate the project," anything added after this doc was written needs a fresh audit of the existing project's env var list before cutover — a silently-missing one here means an admin loses access, not a build failure.

### R8. Northflank Docker build must be rewritten
The current `Dockerfile` assumes it is the whole repo (`COPY . .`, `pnpm install --frozen-lockfile`) and fails without the workspace manifest. Rewrite is in Phase 5; build context moves to repo root and Dockerfile path to `apps/bot/Dockerfile`.

### R9. Per-app `.env` files — do not hoist
Both apps define `TEMPLE_WEB_API_TOKEN`, `DISCORD_BOT_TOKEN`, `DISCORD_RAID_LOGS_CHANNEL_ID`. Web validates at build time via `@t3-oss/env-nextjs` and throws; the bot uses bare cwd-relative `dotenv.config()` with its own required list. A merged root `.env` makes each app's failure mode depend on the other's variables — and the token is shared with Templar besides. **Do:** keep `apps/web/.env` and `apps/bot/.env` with separate `.env.example` files; document in root `CLAUDE.md` that the token must match across all three consumers and that the bot's `API_BASE_URL` == web's `NEXT_PUBLIC_APP_URL`.

### R10. Lower severity
- Two near-identical `discord-pr-notification.yml`; the web's is strictly better (`workflow_dispatch` test inputs). Keep it, drop the bot's.
- `apps/bot/src/config/logger.ts` branches on `RAILWAY_ENVIRONMENT`, which is never set on Northflank — production silently never gets the lightweight logger. Fix in Phase 5.
- The bot's CI "simulate Railway deployment" step is a genuinely useful module-resolution smoke test with a vestigial name. Keep, rename.
- Two `.cursorrules` (near-duplicates) → one root file.
- `CLAUDE.md`: root file for workspace-level content only; app-specific content stays in `apps/*/CLAUDE.md` (nested files are read). The web's own maintenance rule requires this update.
- `.claude/commands/ship.md` assumes one app — needs per-app change detection for labelling.
- winston vs pino: non-blocking, converge in Phase 7.

---

## 5. Execution

### Phase 0 — Prep `[HUMAN]`
1. Merge or close **all** open PRs in both repos; announce a freeze.
2. Create empty `khlav/temple-era` — no README, no `.gitignore`, no license.
3. Export current Vercel project settings and Northflank service config (build context, Dockerfile path, env vars, trigger rules). **This is the rollback reference.**
4. Confirm `git-filter-repo` is installed locally (`git filter-repo --version`).

### Phase 1 — Graft both histories `[AGENT]`
Nothing deploys from this repo yet. Work on `main` directly; it is a fresh repo.

```bash
git clone https://github.com/khlav/temple-raids-t3 /tmp/web-rewrite
cd /tmp/web-rewrite && git filter-repo --to-subdirectory-filter apps/web

git clone https://github.com/khlav/temple-raids-discord-bot /tmp/bot-rewrite
cd /tmp/bot-rewrite && git filter-repo --to-subdirectory-filter apps/bot

mkdir temple-era && cd temple-era && git init -b main
git commit --allow-empty -m "chore(repo): initialize monorepo"
git remote add web /tmp/web-rewrite && git fetch web
git merge web/main --allow-unrelated-histories -m "chore(repo): import temple-raids-t3 as apps/web"
git remote add bot /tmp/bot-rewrite && git fetch bot
git merge bot/main --allow-unrelated-histories -m "chore(repo): import temple-raids-discord-bot as apps/bot"
```

`filter-repo` rewrites SHAs. That is acceptable — the old repos stay archived as the permanent reference for old SHAs and PR links — and it buys a clean path-prefixed log (`git log apps/bot/…` works throughout, no `--follow` needed).

**Acceptance:** ~~`git log --oneline apps/bot/ | wc -l` ≈ 77; `git log --oneline apps/web/ | wc -l` ≈ 50~~ — **these numbers were wrong.** `git log --oneline <path>` applies history simplification (it collapses merge commits), so it never returns the repo's total commit count. The web repo also had 708 commits by the time this ran, not 50.

Use these instead, which actually prove the graft was lossless:

```bash
# 1. Total commit count is exactly the sum of both sources plus our 3 commits
#    (1 empty root + 2 merges). Anything less means history was dropped.
git rev-list --count HEAD          # expect: web_total + bot_total + 3

# 2. Trees are byte-identical to each source's HEAD.
diff <(git ls-tree -r --name-only HEAD apps/web | sed 's|^apps/web/||') \
     <(git -C /path/to/temple-raids-t3 ls-tree -r --name-only origin/main)
diff <(git ls-tree -r --name-only HEAD apps/bot | sed 's|^apps/bot/||') \
     <(git -C /path/to/temple-raids-discord-bot ls-tree -r --name-only origin/main)
```

**Result when executed (2026-07-27):** 788 = 708 + 77 + 3 ✅; both tree diffs empty ✅; `apps/web/public/` (42 files) and `apps/web/src/` (357 files) tracked ✅.

### Phase 2 — Workspace scaffolding and toolchain `[AGENT]`
1. Hoist to root from `apps/web/`: `.npmrc`, `.nvmrc`, `.oxlintrc.json`, `lefthook.yml`, `.lefthook/`, `.claude/`, `.agent/`, `.github/`. Leave everything else in place.
2. Root `.gitignore` per **R1**; each app keeps its own file unchanged. Then verify:
   ```bash
   git check-ignore -v apps/web/public/favicon.ico   # must exit 1 (NOT ignored)
   git check-ignore -v apps/web/.next/BUILD_ID       # must exit 0 (ignored)
   git status --porcelain | grep '^ D'               # must be empty
   ```
3. Root `package.json` (private, scripts only, `"prepare": "lefthook install"`, `"packageManager": "pnpm@9.15.1"`), `pnpm-workspace.yaml` (`packages: ["apps/*", "packages/*"]`), `turbo.json` with `build` → `dependsOn: ["^build"]`.
4. Delete `apps/bot/.husky/`; drop `husky` + `lint-staged` + its `prepare` script (**R2**). Port husky's `console.log` / `TODO` warnings into `lefthook.yml` as non-blocking, or drop them deliberately.
5. Bot → oxlint + oxfmt; delete `eslint.config.js`, `prettier.config.js` and their deps. **Land the formatting churn as its own commit** and add that SHA to `.git-blame-ignore-revs`.
6. Bot `engines` → `>=22.0.0 <23.0.0`; remove `packageManager` from both app manifests (**R4**).
7. Extend `lefthook.yml` globs to `apps/**/src/**`; make typecheck/build per-app via Turborepo.
8. `pnpm install`. Diff the bot's tree against the old repo (**R5**):
   ```bash
   pnpm --filter temple-raids-discord-bot list --depth 2
   ```
9. Root `CLAUDE.md` (workspace-level only); trim `apps/*/CLAUDE.md` to app-specific content; merge the two `.cursorrules`; update `/ship` for two apps.

**Acceptance:** `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green from the repo root.

### Phase 3 — CI `[AGENT]` + repo settings `[HUMAN]`
`[AGENT]`
- Keep the web's `discord-pr-notification.yml`; delete the bot's copy.
- Replace `build-test.yml` with one `ci.yml` using `dorny/paths-filter` to gate a `web` job and a `bot` job; **both** must also run when `packages/**` or `pnpm-lock.yaml` change.
- Node/pnpm via `corepack enable` + `actions/setup-node` with `node-version-file: .nvmrc`.
- Keep the bot's module-resolution smoke test; rename it off "Railway".
- Restore `.github/pull_request_template.md` at root.

`[HUMAN]` — per **R6**: add `DISCORD_WEBHOOK_URL` (and any other Actions secrets from the export), recreate the `user-facing` label, enable branch protection on `main`.

**Acceptance:** a throwaway PR touching only `apps/bot/**` runs the bot job and skips web; the reverse for `apps/web/**`; a `pnpm-lock.yaml` change runs both.

### Phase 4 — Web cutover `[HUMAN]`, verified `[AGENT]`

> ### ⛔ RELEASE GATE — migrations no longer run automatically
>
> Phase 2 moved `drizzle-kit migrate` **out of** the web app's `postbuild` script and into
> an explicit `db:deploy` script, so that local pre-push hooks and CI could build without
> mutating a database.
>
> **Consequence: if you repoint Vercel without changing its Build Command, production will
> deploy new application code against an un-migrated database.** That is a silent failure —
> the build goes green and the app breaks at runtime on the first query touching a new
> column.
>
> Set the Vercel **Build Command** to run both, in order:
>
> ```bash
> pnpm build && pnpm --filter temple-raid-t3 db:deploy
> ```
>
> Verify on a preview deployment that the migrate step appears in the build log **before**
> promoting to production. Do not treat Phase 4 as complete until you have seen it run.

Per **R7**: repoint the **existing** Vercel project's Git repo to `khlav/temple-era`; Root Directory → `apps/web`; enable *include files outside root*; Ignored Build Step → `npx turbo-ignore`.

**Verify on a preview deployment before promoting:** home page renders; `/api/v1/openapi.json` returns a spec byte-identical to production's; an authenticated `/api/v1/me` call with an existing token succeeds. That last check is the Templar gate — if it fails, stop.

**Rollback:** repoint the Vercel project's Git repo back to `temple-raids-t3`, Root Directory back to `.`.

### Phase 5 — Bot cutover `[AGENT]` build, `[HUMAN]` deploy
`[AGENT]` — rewrite `apps/bot/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bot/package.json apps/bot/
# add packages/*/package.json here once Phase 7 lands
RUN pnpm install --frozen-lockfile --filter temple-raids-discord-bot...

FROM deps AS build
COPY . .
RUN pnpm --filter temple-raids-discord-bot build
RUN pnpm deploy --filter temple-raids-discord-bot --prod /out

FROM base AS runner
COPY --from=build /out /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
CMD ["node", "dist/index.js"]
```

Notes: `pnpm deploy` semantics changed in pnpm 10 (needs `--legacy`) — we are on 9.15.1, keep it pinned. The bot's `prepare` script must already be gone or `pnpm install` runs lefthook against a nonexistent `.git`. Also fix the dead `RAILWAY_ENVIRONMENT` check in `apps/bot/src/config/logger.ts` (**R10**).

Then `docker build -f apps/bot/Dockerfile .` and run the container locally against a **test** Discord server.

`[HUMAN]` — create a **new** Northflank service on a non-production branch with test credentials (build context `/`, Dockerfile `apps/bot/Dockerfile`); verify; then repoint the production service at the monorepo, keeping the old definition saved. Add a build-path filter if the plan tier supports it; if not, accept that web commits restart the bot (stateless, 128 MB, cheap).

**Rollback:** repoint Northflank at `temple-raids-discord-bot` — a settings change, not a code restore.

### Phase 6 — Archive `[HUMAN]`
Wait ~1 week of normal operation. Then **archive** (never delete) both old repos. Archived keeps every old SHA, PR, and issue link resolving — which is what makes R6 and both rollbacks survivable.

### Phase 7 — Collect the payoff `[AGENT]`, one PR each
- **`packages/contracts`** — one Zod schema per `/api/discord/*` request/response, compiled per **R3**. Web handlers parse with it; bot fetch wrappers type against it. Replaces the bot's hand-declared `PermissionCheckResult` and the routes' untyped `await request.json()`. **Must not alter any wire format** — Templar depends on the proxy route. Wire formats are stable, but the *authorization meaning* behind them is not: as of 2026-07, all five `/api/discord/*` endpoints gate on scopes (e.g. `raidlog:manage`) rather than the legacy `isRaidManager`/`isAdmin` booleans. Contract schemas authored against the old semantics would be wrong even though the JSON shape hasn't moved.
  - The bot's hand-declared `PermissionCheckResult` still includes `isRaidManager`/`isAdmin`, and `check-permissions` still returns them for compatibility. Removing those fields (tracked as issue #285 in the web repo) is a **cross-repo breaking change** — the bot must migrate to reading `scopes` before the fields are dropped. Do this here, in Phase 7, where both apps' code is visible in the same PR, not as a solo web-side change. See `docs/followups/legacy-access-booleans-cleanup.md` for the deprecation's full history.
- **`packages/wcl`** — shared URL/report-ID parsing, deduplicating `apps/bot/src/services/wclDetector.ts` against `apps/web/src/server/api/wcl-helpers.ts`.
- Converge the bot onto pino; delete winston and the console shim.
- Add Vitest to the bot — `wclDetector`, `benchParser`, `messageDeduplication` are pure functions and the bot has zero tests today.

---

## 6. Verification

**Every phase:** `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from the root.

| Phase | Gate |
|---|---|
| 1 | Commit counts ≈ 50 / 77; `apps/web/public/` tracked |
| 2 | Three `git check-ignore` assertions; full local gate green; bot dep-tree diff reviewed |
| 3 | Path-filtered CI proven with a throwaway PR touching each app |
| 4 | Vercel preview: page renders, `/api/v1/openapi.json` byte-identical, authenticated `/api/v1/me` succeeds (**Templar gate**) |
| 5 | Local container completes the full flow on a test server: WCL link → raid created → thread created → bench message updates bench → cleanup cron. Then the same on staging Northflank. Then **watch one real raid-log post end-to-end** in production |
| 7 | Bot Vitest suites green; `/api/v1/openapi.json` unchanged vs. the Phase 4 capture |

## 7. Effort and risk

| Phase | Effort | Risk | Blast radius |
|---|---|---|---|
| 0 Prep | 1h | — | — |
| 1 Graft | 1–2h | Low | Inert repo |
| 2 Scaffold + toolchain | half day | Low | Inert repo |
| 3 CI + settings | 2–3h | Low | Broken checks only |
| 4 Web cutover | 2h + verify | **High** | Site down; `postbuild` runs prod migrations |
| 5 Bot cutover | half day + a week watching | **High** | Discord automation down |
| 6 Archive | 15m | Low | — |
| 7 Shared packages | ongoing | Medium | Contract regressions — mitigated by then having tests |

**The two things that most reduce risk:** the `/api/v1/me` + OpenAPI check on the Vercel preview before promoting (Phase 4), and running the new container against a test Discord server before repointing Northflank (Phase 5).
