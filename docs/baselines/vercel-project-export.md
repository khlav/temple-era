# Vercel project export — pre-cutover rollback reference

Phase 0 step 3. Captured **2026-07-28**, before any Vercel setting was changed.

If Phase 4 goes wrong, this is what "put it back" means.

| | |
|---|---|
| Project | `temple-raids-t3` (`prj_1FA6FdLbaChGC8r7Gx5jvBqZRHjT`) |
| Team | Temple Era — `templeera` (`team_wdBCZ8Y87qHTMpsJXnVRT7zi`) |
| Created | 2025-01-10 |
| Production URL | https://www.temple-era.com |

## Build & Git settings (the ones Phase 4 changes)

| Setting | **Current value** | Phase 4 target |
|---|---|---|
| Git repository | `github:khlav/temple-raids-t3` | `github:khlav/temple-era` |
| Production branch | `main` | `main` (unchanged) |
| Root Directory | **null** (repo root) | `apps/web` |
| Include files outside Root Dir | **true** | true (already correct) |
| Build Command | **null** → framework default | `pnpm build && pnpm --filter temple-era-web db:deploy` |
| Install Command | null → default | null |
| Output Directory | null → default | null |
| Ignored Build Step | **unset** → every commit builds | **unchanged** — Vercel's built-in Skip Deployments (on by default) replaces `turbo-ignore` |
| Framework | `nextjs` | unchanged |
| Node version | `22.x` | unchanged |
| Function region | `iad1` | unchanged |
| Git fork protection | true | unchanged |
| Deployment protection (SSO) | `prod_deployment_urls_and_all_previews` | unchanged — **see warning** |

### ⛔ Why `Build Command: null` is the release gate

Today the Build Command is empty, so Vercel runs the Next.js default `next build`.
The npm lifecycle then fires `postbuild`, which is how migrations have always run
in production — implicitly, with no Vercel configuration at all.

Phase 2 moved `drizzle-kit migrate` out of `postbuild` into `db:deploy`. **Nothing
in Vercel currently references it.** Repointing the repo without also setting the
Build Command means production deploys build green and ship application code
against an un-migrated schema, failing at runtime instead of at build time.

Migrations resolve their connection as `DATABASE_MIGRATION_URL ?? DATABASE_URL`
(`apps/web/drizzle.config.ts`) — deliberately a **session-mode** URL, because
Supavisor's transaction pooler breaks unqualified DDL. Both variables exist and
are set per-environment (see below), so this works unchanged after the cutover.

### ⚠️ Deployment protection blocks preview verification

`ssoProtection` is `prod_deployment_urls_and_all_previews` — **every preview
deployment requires Vercel authentication**. An unauthenticated request to a
preview URL is intercepted by Vercel before it ever reaches the app, so
`scripts/verify-deployment.sh` would report failures that say nothing about the
deployment itself.

To verify a preview, generate a **Protection Bypass for Automation** secret
(Project Settings → Deployment Protection) and pass it:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=... scripts/verify-deployment.sh https://<preview>.vercel.app
```

The script sends it as `x-vercel-protection-bypass`. Do not disable protection
to work around this.

## Environment variables — 44 entries

**Names and targets only.** Values are deliberately not captured: Phase 4
*repoints* the existing project rather than recreating it, so values never move,
and a file full of production secrets is a liability with no upside. If the plan
ever changes to recreating the project, these must be re-exported **with** values
first — a hand-retyped `DATABASE_URL` against production is the exact hazard R7
exists to prevent.

### Database (per-environment — production and preview differ)

| Name | Targets | Type |
|---|---|---|
| `DATABASE_URL` | production | sensitive |
| `DATABASE_URL` | preview | sensitive |
| `DATABASE_MIGRATION_URL` | production | sensitive |
| `DATABASE_MIGRATION_URL` | preview | sensitive |

**Preview and production point at different databases.** This resolves a concern
raised earlier in the migration: because migrations were welded to `build`, every
preview deployment ran `drizzle-kit migrate` — but against the *preview* database,
never production. Preserve this separation.

### Access control

| Name | Targets | Type |
|---|---|---|
| `SUPERADMIN_DISCORD_IDS` | production, preview | sensitive |
| `API_TOKEN_ENCRYPTION_KEY` | production, preview | sensitive |

`SUPERADMIN_DISCORD_IDS` is the env-derived break-glass superadmin access the plan
flags (added 2026-07, no DB row). It survives repointing. If it were ever lost, an
admin loses access — and that failure is silent, not a build error.

### Build-time behaviour

| Name | Targets | Notes |
|---|---|---|
| `LEFTHOOK` | production, preview | **Load-bearing.** Root `package.json` still has `"prepare": "lefthook install"`, which runs on every Vercel install. This disables it. Nothing in the repo references this variable, so it is easy to delete by mistake. |
| `NEXT_TELEMETRY_DISABLED` | all | |

### Application

`AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` (all targets) ·
`WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`, `WCL_OAUTH_URL`, `WCL_API_URL` (all) ·
`BATTLENET_CLIENT_ID`, `BATTLENET_CLIENT_SECRET`, `BATTLENET_OAUTH_URL` (all) ·
`DISCORD_BOT_TOKEN`, `DISCORD_SERVER_ID`, `DISCORD_RAID_LOGS_CHANNEL_ID`,
`DISCORD_RAID_SR_CHANNEL_IDS`, `DISCORD_RAID_HELPER_BOT_ID` (all) ·
`RAID_HELPER_API_KEY` (all) · **`TEMPLE_WEB_API_TOKEN`** (all — shared with the bot
*and* Templar; changing it is a three-way breaking change) ·
`NEXT_PUBLIC_APP_URL` (production) · `NEXT_PUBLIC_POSTHOG_*` (all) ·
`NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL` (all) · `GOOGLE_SITE_VERIFICATION` (production)

### Possible cruft — do not delete during the migration

A cluster of production-only variables that the application code does not appear to
read, likely left by a Vercel Postgres/Neon integration:

`PGDATABASE` `PGHOST` `PGHOST_UNPOOLED` `PGUSER` `POSTGRES_DATABASE` `POSTGRES_HOST`
`POSTGRES_PASSWORD` `POSTGRES_PRISMA_URL` `POSTGRES_URL` `POSTGRES_URL_NO_SSL`
`POSTGRES_URL_NON_POOLING` `POSTGRES_USER`

Worth auditing **after** the cutover is stable. Removing variables during a migration
turns one change into two, and this is not the moment.

## Domains — 5

| Domain | Behaviour |
|---|---|
| `www.temple-era.com` | **primary** |
| `temple-era.com` | → `www.temple-era.com` |
| `templeashkandi.com` | → `www.temple-era.com` |
| `www.templeashkandi.com` | → `www.temple-era.com` |
| `temple-raids-t3-eight.vercel.app` | → `www.temple-era.com` |

All verified. Domains attach to the **project**, not the repo, so repointing Git
leaves them untouched. This is the single strongest reason to repoint rather than
recreate: a new project starts with none of these, and moving an apex domain
between projects means downtime.

## Rollback

Phase 4 is reversible as a settings change — no code restore:

1. Project Settings → Git → change repository back to `khlav/temple-raids-t3`
2. Root Directory → clear it (back to null / repo root)
3. Build Command → clear it (back to framework default)
4. Ignored Build Step → clear it
5. Redeploy

Env vars, domains, and protection settings are untouched by any of the above.

## Reproducing this export

```bash
pnpm dlx vercel@latest login
TOKEN=$(node -e "console.log(require(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json').token)")
TEAM=team_wdBCZ8Y87qHTMpsJXnVRT7zi
PROJ=prj_1FA6FdLbaChGC8r7Gx5jvBqZRHjT
curl -sS -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v9/projects/$PROJ?teamId=$TEAM"
curl -sS -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v10/projects/$PROJ/env?teamId=$TEAM"
curl -sS -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v9/projects/$PROJ/domains?teamId=$TEAM"
```
