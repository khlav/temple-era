# Northflank Deployment

How the Discord bot is deployed. It runs as a single always-on container on
Northflank, built from this monorepo.

> This describes the **current** setup. The service already exists and is
> running — you should not need to create it. For the one-time cutover from the
> standalone repo, see `docs/phase-5-bot-cutover.md`.

## Current configuration

| | |
|---|---|
| Project / service | `temple-discord-bot` / `temple-discord-bot` |
| Repository | `khlav/temple-era` (branch `main`) |
| Build context | `/` — the **repo root**, not `apps/bot` |
| Dockerfile path | `/apps/bot/Dockerfile` |
| Compute plan | `nf-compute-10` — 0.1 vCPU / 256 MB |
| Instances | 1 |
| Cluster | `nf-us-east1` |
| Path rule | `apps/web` (ignore) |
| Ports | one internal HTTP port, not public |

**The build context must be the repo root.** `pnpm-lock.yaml` and
`pnpm-workspace.yaml` live there, and the install cannot resolve without them.

**The path rule matters.** Without ignoring `apps/web`, every web commit rebuilds
and restarts the bot, dropping the gateway connection for no reason. Northflank
path rules use `.gitignore` syntax, and a commit is skipped only if *every*
modified file matches — so a commit touching both apps still builds the bot.

## Environment variables

Four are required (`src/config/env.ts`), and they come from **two different
places**:

| Variable | Source |
|---|---|
| `API_BASE_URL` | service runtime environment |
| `DISCORD_RAID_LOGS_CHANNEL_ID` | service runtime environment |
| **`DISCORD_BOT_TOKEN`** | **secret group** |
| **`TEMPLE_WEB_API_TOKEN`** | **secret group** |

Optional, all in the service runtime environment: `LOG_LEVEL`,
`DISCORD_LOG_THREAD_CLEANUP_ENABLED`, `DISCORD_LOG_THREAD_CLEANUP_DAYS`,
`DISCORD_LOG_THREAD_CLEANUP_CRON`.

> ### ⚠️ A new service starts with no secret group attached
>
> If you ever create a *new* service rather than editing this one, link the
> secret group first. Otherwise the build goes green and the container dies at
> startup on a missing `DISCORD_BOT_TOKEN`, with nothing in the build log to
> explain why.

Two values must agree with other systems:

- `API_BASE_URL` must equal the web app's `NEXT_PUBLIC_APP_URL`
  (`https://www.temple-era.com`).
- `TEMPLE_WEB_API_TOKEN` is shared by the web app, this bot, **and the external
  Templar bot**. Changing it is a three-way breaking change.

## Deploying

Push to `main`. Northflank builds and redeploys automatically, unless the commit
only touches `apps/web`.

The image is built by `apps/bot/Dockerfile`: multi-stage on `node:22-alpine`,
manifests copied before sources so the install layer caches, then
`pnpm deploy --prod` collects a standalone runtime tree. It runs as a non-root
user and holds no ports open.

Two things in that Dockerfile are load-bearing and easy to break:

- **`--ignore-scripts` on *both* the install and the `pnpm deploy` step.** The
  root `package.json` has `"prepare": "lefthook install"`, and `pnpm deploy`
  performs its own install. git is not in the image, so lefthook fails the build.
  Guarding only the first step is not enough — this was found the hard way.
- **Filters are path-based (`./apps/bot`), not by package name.**
  `pnpm --filter <unknown-name>` prints a warning and exits **0**, so a stale
  name would produce a green build that silently did nothing.

## Verifying a deploy

Check the service logs for:

```
[2026-08-01 21:29:03] info: Thread cleanup scheduled: 0 1 * * * (ET)
[2026-08-01 21:30:43] info: Attempting to create raid {...}
[2026-08-01 21:30:44] info: Raid operation successful {...}
[2026-08-01 21:30:44] info: Created new thread for raid {...}
```

The timestamps matter: they confirm the Winston logger is running.

The bot acts only on **new** gateway events and never replays history, so the
real test is posting a WCL link in the raid-logs channel and confirming a raid
plus a thread appears. Then `bench <name>` in that thread.

## Local testing

From the **repo root**:

```bash
pnpm dev:bot                                          # tsx watch, hot reload
docker build -f apps/bot/Dockerfile -t temple-bot .   # note the trailing dot
docker run --rm --env-file apps/bot/.env temple-bot
```

Building from inside `apps/bot` cannot work — the context must be the repo root.

Running locally alongside the production bot is safe if they watch different
channels. Even on the same channel the damage is cosmetic: `create-raid` is
idempotent on WCL report ID and the handler checks for an existing thread, so
you get a duplicate raid-URL message rather than duplicate raids or threads.

**Reaching a local web server from the container:** `localhost` inside the
container is the container. Use `API_BASE_URL=http://host.docker.internal:3000`
on Docker Desktop, or your host's LAN IP.

The Dockerfile never copies `.env` into the image; variables are supplied at
runtime.

## Troubleshooting

**Build fails on `lefthook install`** — an `--ignore-scripts` flag was dropped.
See above; both the install and the `pnpm deploy` step need it.

**`ERR_PNPM_OUTDATED_LOCKFILE`** — run `pnpm install` at the repo root and commit
the lockfile.

**Build cannot find `pnpm-workspace.yaml`** — build context is not the repo root.

**Container starts, then exits** — a required variable is missing, most likely
because the secret group is not attached. The process exits 1, so Northflank
restarts it, which looks like a crash loop.

**Bot runs but ignores messages** — check `DISCORD_RAID_LOGS_CHANNEL_ID`, and
that the bot has the **Message Content** privileged intent plus Send Messages and
Create Public Threads.

**Web commits rebuild the bot** — the `apps/web` path rule is missing or
malformed. A leading space makes it match nothing.

## Rollback

Settings change only, no code restore:

1. Repository → `khlav/temple-raids-discord-bot` (archived; unarchive first —
   archived repos are read-only)
2. Dockerfile path → `/Dockerfile`
3. Remove the `apps/web` path rule
4. Rebuild

Compute plan, ports, storage, secret group, and runtime environment are
untouched by any of the above.

## Notes

- **Logs:** Northflank dashboard. The CLI has no log command.
- **Secrets:** keep `DISCORD_BOT_TOKEN` and `TEMPLE_WEB_API_TOKEN` in the secret
  group, never in the plain runtime environment.
- **Restarts:** the bot is stateless with no volumes, so a restart is cheap. It
  reconnects to the gateway on its own.
