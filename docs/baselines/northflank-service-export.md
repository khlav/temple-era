# Northflank service export — pre-cutover rollback reference

Phase 0 step 3, bot half. Captured **2026-07-28**, before any Northflank setting
was changed. Companion to `vercel-project-export.md`.

If Phase 5 goes wrong, this is what "put it back" means.

| | |
|---|---|
| Project | `temple-discord-bot` |
| Service | `temple-discord-bot` (`/dirktecs-team/temple-discord-bot/temple-discord-bot`) |
| Service type | `combined` (build + deploy in one service) |
| Cluster | `nf-us-east1`, namespace `ns-jb4grm5qmfxq` |
| Compute plan | **`nf-compute-10`** — 0.1 vCPU / 256 MB (~$2.70/mo) |
| Instances | 1 |
| Last successful build | 2026-07-26 |

## Git & build settings (the ones Phase 5 changes)

| Setting | **Current value** | Phase 5 target |
|---|---|---|
| Repository | `github.com/khlav/temple-raids-discord-bot` | `github.com/khlav/temple-era` |
| Branch | `main` | `main` (unchanged) |
| Build context (`dockerWorkDir`) | `/` | `/` (unchanged — already repo root) |
| Dockerfile path | `/Dockerfile` | **`/apps/bot/Dockerfile`** |
| Build source | `git` | unchanged |
| Build arguments | `{}` | unchanged |
| CI enabled | true | unchanged |
| CD enabled | true | unchanged |
| Path ignore rules | **`[]` (none)** | see below |
| Allow-list mode | false | — |

### Path filtering IS supported — the plan assumed it might not be

Phase 5 of the migration plan says to "add a build-path filter if the plan tier
supports it; if not, accept that web commits restart the bot." It does support
it: `buildConfiguration.pathIgnoreRules` exists on this service and is currently
empty, with `isAllowList: false`.

So after the cutover, add an ignore rule for `apps/web/**` — otherwise every web
commit rebuilds and restarts the bot, since both apps will share one repository.
The bot is stateless so a restart is survivable, but it is pointless churn and it
briefly drops the gateway connection.

Alternatively set `isAllowList: true` with `apps/bot/**` plus the shared root
files (`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `turbo.json`) —
the same split the GitHub Actions path filter uses in `.github/workflows/ci.yml`.

## Networking

| | |
|---|---|
| Port | `p01` — internal 3000, HTTP, **not public** |
| Internal DNS | `p01--temple-discord-bot--jb4grm5qmfxq.code.run` |
| Load balancing | `leastConnection` |
| Public domains | none |

The bot is a Discord **gateway** client — it holds an outbound WebSocket and
serves no inbound traffic. The port exists but nothing depends on it being
reachable.

## Storage

| | |
|---|---|
| Ephemeral storage | 1024 MB |
| `/dev/shm` | 64 MB |
| Persistent volumes | none |

Stateless. This is what makes both the Phase 5 rollback and a restart cheap.

## Runtime environment

Five plain environment variables are set directly on the service:

| Name | Notes |
|---|---|
| `API_BASE_URL` | Must equal the web app's `NEXT_PUBLIC_APP_URL` |
| `DISCORD_RAID_LOGS_CHANNEL_ID` | Channel the bot watches |
| `DISCORD_LOG_THREAD_CLEANUP_ENABLED` | |
| `DISCORD_LOG_THREAD_CLEANUP_DAYS` | |
| `DISCORD_LOG_THREAD_CLEANUP_CRON` | |

### ⚠️ Gap in this export: two required secrets are not enumerated

`apps/bot/src/config/env.ts` requires four variables. Two of them —
**`DISCORD_BOT_TOKEN`** and **`TEMPLE_WEB_API_TOKEN`** — are *not* in the
service's runtime environment, so they are supplied by a **secret group**.

The read-only API token used for this export cannot list secret groups:

```
The token used to authenticate does not have permission to access this endpoint.
The required permission is 'Project > Secrets > SecretGroups > List'.
```

This does not matter for the planned Phase 5 path, because repointing the
**existing** service leaves secret groups attached and untouched. It matters a
great deal if a **new** service is created — including the staging service Phase 5
calls for — because a new service starts with no secret group linked, and the bot
will fail at startup on a missing `DISCORD_BOT_TOKEN` with no build error to warn
you.

**Before creating any new Northflank service, record manually from the dashboard:**
which secret group is linked, and which variables it provides. Or re-run this
export with a token carrying `ps_secrets_secretGroups_list`.

`TEMPLE_WEB_API_TOKEN` is the three-way shared token — web, bot, and the external
Templar bot. It must match across all three; changing it anywhere is a breaking
change everywhere.

## Rollback

Phase 5 is reversible as a settings change, not a code restore:

1. Service → Build settings → repository back to `khlav/temple-raids-discord-bot`
2. Dockerfile path back to `/Dockerfile`
3. Build context stays `/` — it never changed
4. Clear any `pathIgnoreRules` added after the cutover
5. Rebuild

Compute plan, ports, storage, secret groups, and runtime env are untouched by any
of the above.

## Reproducing this export

```bash
pnpm dlx @northflank/cli login          # needs an API token
pnpm dlx @northflank/cli list projects -o json
pnpm dlx @northflank/cli list services --project temple-discord-bot -o json
pnpm dlx @northflank/cli get service \
  --project temple-discord-bot --service temple-discord-bot -o json
```

For the secret-group gap, the token additionally needs
`Project > Secrets > SecretGroups > List`.
