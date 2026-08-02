# Phase 7 handoff prompt

Copy everything below the line into a fresh agent session.

---

You are working in `khlav/temple-era`, a pnpm + Turborepo monorepo with two
deployed apps. Read `AGENTS.md` at the root first, then `apps/web/AGENTS.md` or
`apps/bot/AGENTS.md` for whichever app you touch.

**Task: Phase 7 of the monorepo migration** — extract shared code into
`packages/`. Background is in `docs/monorepo-migration-plan.md` (see **R3** and
the Phase 7 section). Phases 0–6 are complete; both apps deploy from this repo.

Ship each item as its own PR. Say "ship it" to use `/ship`, which opens the PR
and hands off to `/fix-pr` for the Greptile review loop.

## Hard constraints

**1. Shared packages must be COMPILED, not raw TypeScript.** This is the whole
reason `packages/` has stayed empty. The two apps disagree on module resolution:

| App | `module` | `moduleResolution` | Emits |
|---|---|---|---|
| `apps/web` | `ESNext` | `Bundler` | `noEmit` |
| `apps/bot` | `Node16` | `Node16` | `dist/` |

The usual "raw `.ts` internal package" pattern works for Next.js via
`transpilePackages` but **fails for the bot**, whose `tsc -p tsconfig.prod.json`
only emits `src/`. So each shared package must:

- compile with `tsc` to `dist/`
- set `"type": "module"`
- expose an `exports` map with both `types` and `default`
- use **`.js`-suffixed relative imports** in its own source — required by
  `Node16`, accepted by `Bundler`

**2. Do not change any wire format.** An external bot, **Templar**, consumes
`/api/v1/*` and `/api/discord/proxy/[discordId]` with the shared
`TEMPLE_WEB_API_TOKEN`. It is not in this repo and cannot be updated in lockstep.
Treat this as a release gate.

Verify before and after with the captured baseline:

```bash
./scripts/verify-deployment.sh https://www.temple-era.com
```

`docs/baselines/openapi-v1-prod.json` must stay byte-identical. Regenerating it
to make a check pass defeats its purpose.

**3. Declare cross-package dependencies explicitly.** Vercel's Skip Deployments
reads the workspace graph. If `apps/web` imports `packages/contracts` without
listing it in `apps/web/package.json`, Vercel will **skip web builds** when only
the package changes — a silent staleness bug.

**4. Update the bot Dockerfile.** `apps/bot/Dockerfile` has a marked line:

```dockerfile
# Add packages/*/package.json here when packages/ stops being empty (Phase 7).
```

Miss it and the Docker build fails on a missing manifest.

**5. Never put a package name in an external build command.** `pnpm --filter
<unknown-name>` prints a warning and **exits 0**, so a stale name is a green
build that does nothing. Vercel uses `pnpm build && pnpm db:deploy`; the
Dockerfile filters by path (`./apps/bot`). CI enforces this via
`.github/scripts/check-filters.mjs`, which also fails if it finds no references.

## Work items

### 1. `packages/contracts` — highest value

One Zod schema per `/api/discord/*` request and response. Five endpoints:
`check-permissions`, `create-raid`, `update-raid`, `update-bench`, `proxy`.

Replaces:
- the bot's hand-declared `PermissionCheckResult` (`apps/bot/src/services/permissionChecker.ts:4`)
- untyped `await request.json()` in the web route handlers

**Authorization semantics have moved, but the JSON has not.** All five endpoints
now gate on scopes (e.g. `raidlog:manage`) rather than the legacy
`isRaidManager`/`isAdmin` booleans. `check-permissions` still *returns*
`isRaidManager` for compatibility (`route.ts:78`), and the bot still reads it.
Schemas written against the old semantics would be wrong even though the shape
matches.

Removing those legacy fields is tracked as issue #285 in the archived web repo
and is a **cross-repo breaking change** — the bot must migrate to reading
`scopes` before the fields are dropped. Do that here, where both apps are in one
PR. Context: `docs/followups/legacy-access-booleans-cleanup.md`.

### 2. `packages/wcl`

Deduplicate WCL URL and report-ID parsing between:
- `apps/bot/src/services/wclDetector.ts`
- `apps/web/src/server/api/wcl-helpers.ts`

Check for behavioural drift before merging them — the bot's version was patched
for `warcraftlogs.com` URLs without a `vanilla`/`classic` subdomain. Add tests
covering both variants.

### 3. Bot tests

The bot has none. `wclDetector`, `benchParser`, and `messageDeduplication` are
pure functions. Add Vitest to `apps/bot`, matching the web app's setup.

### 4. Bot logging: winston → pino

Lowest priority. `apps/web` uses pino; `apps/bot` uses winston. Note
`apps/bot/src/config/logger.ts` was recently simplified — a dead
`RAILWAY_ENVIRONMENT` branch and its console shim were removed — so start from
the current file. Preserve `handleExceptions`/`handleRejections` behaviour and
timestamped output; the Northflank deploy doc treats timestamps as the
healthy-startup signal.

## Verification

Per PR, from the repo root:

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

For anything touching the bot, also:

```bash
docker build -f apps/bot/Dockerfile -t temple-bot .
```

CI cannot catch Docker build failures — the last two were only found locally.

For anything touching web routes or the API surface, run
`scripts/verify-deployment.sh` against the preview deployment before merging.
It needs `VERCEL_AUTOMATION_BYPASS_SECRET` (previews are behind Vercel auth) and
`~/.temple-era-token` for the authenticated check; both are already on the
machine.

## Notes

- `main` is protected: PR required, aggregate `CI` check must pass, branch must
  be current (`strict: true`, so `gh pr update-branch` if blocked).
- Commit format `type(scope): description`, types `feat|fix|chore|refactor|hotfix|dev`
  — no `docs`. Scope bot changes as `bot/...`.
- Merge with `--squash` unless the branch has a commit whose SHA is referenced
  (e.g. `.git-blame-ignore-revs`).
- Do not merge without explicit authorization from the user.
