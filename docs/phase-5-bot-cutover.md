# Phase 5 — Bot cutover runbook

Repoint the **existing** Northflank service at the monorepo. ~20 minutes plus
watching one real raid post.

Prior settings are recorded in `docs/baselines/northflank-service-export.md` —
that is the rollback reference.

> **Simplified from the original plan.** It called for a second Northflank
> service on a test Discord server with test credentials. For a stateless bot
> whose rollback is a settings change, that is more scaffolding than the risk
> warrants. A local `docker build` plus CI's module-resolution check covers the
> realistic failure modes. It also sidesteps the secret-group trap below.

---

## What changed in the repo

- **`apps/bot/Dockerfile` rewritten** for the workspace — multi-stage, Node 22,
  builds from the repo root
- **Root `.dockerignore` added** — the build context moved to the repo root, so
  `apps/bot/.dockerignore` no longer applies
- **`src/config/logger.ts`** — removed the dead `RAILWAY_ENVIRONMENT` branch and
  the console shim it selected

---

## Step 1 — Build and run it locally

Start Docker Desktop, then from the repo root:

```bash
cd /Users/kirkhlavka/workspace/repos/temple-raids/temple-era
docker build -f apps/bot/Dockerfile -t temple-bot .
```

Note the trailing `.` — the context is the **repo root**. Building from
`apps/bot/` cannot work: the lockfile and workspace manifest live at the root.

Then run it against the real Discord server, with the **production service
stopped first** (see the warning below):

```bash
docker run --rm --env-file apps/bot/.env temple-bot
```

Expect `Starting Discord bot...` followed by a successful gateway login. Post a
WCL link in the raid-logs channel and confirm a thread appears.

> ### Running alongside the live bot is fine
>
> Both instances receive the same `MESSAGE_CREATE` events, but the damage is
> cosmetic — verified by reading the code, 2026-08-01:
>
> - **No duplicate raids.** `create-raid` looks up the raid log by WCL report ID
>   and returns the existing raid instead of inserting.
> - **No duplicate threads.** `messageHandler.ts` checks `if (message.thread)`
>   first, and Discord allows only one thread per message regardless.
> - **You will see a duplicate raid-URL message** in the thread, since both bots
>   post it.
>
> Running both is actually a good test: you can watch the new image respond to a
> real gateway event. Pause Northflank only if the duplicate message would
> confuse people.

---

## Step 2 — Repoint Northflank

Northflank → project `temple-discord-bot` → service `temple-discord-bot` →
**Build settings**.

| Setting | Current | Change to |
|---|---|---|
| Repository | `khlav/temple-raids-discord-bot` | **`khlav/temple-era`** |
| Branch | `main` | `main` (unchanged) |
| Build context / `dockerWorkDir` | `/` | `/` (**unchanged** — already correct) |
| Dockerfile path | `/Dockerfile` | **`/apps/bot/Dockerfile`** |

Only two fields actually change: repository and Dockerfile path.

### Then add a path rule

**Service → Build options → Advanced build settings → Path rules** — the same
page as the two fields above, further down.

Add, using **`.gitignore` syntax** (not glob):

```
apps/web/
```

Without it, every web commit rebuilds and restarts the bot. The bot is stateless
so a restart is survivable, but it drops the gateway connection for no reason.

Two details from Northflank's docs:

- The rule is **all-or-nothing per commit**: a commit is skipped only if *every*
  modified file matches. A commit touching both apps still builds the bot, which
  is the safe direction.
- Northflank also supports allow-list mode (`isAllowList: true`) where you list
  what *should* build. This service has `isAllowList: false`, so a single ignore
  rule is the smaller change.

Commit-message flags are already enabled by default — `[skip ci]`, `[skip nf]`,
and similar — useful for docs-only commits.

The export confirmed `pathIgnoreRules` exists on this service and is currently
empty; the original plan hedged that the tier might not support it.

---

## Step 3 — Watch a real raid

The bot only acts on new gateway events; it does not replay history. So the
proof is a live post:

1. Confirm the service reaches **Running** after the rebuild
2. Check logs for `Starting Discord bot...` and a successful login
3. Post a WCL link in the raid-logs channel
4. Confirm the raid is created and a thread appears
5. Post `bench <name>` in that thread and confirm the bench updates

---

## Rollback

Settings change, not a code restore:

1. Build settings → repository back to `khlav/temple-raids-discord-bot`
2. Dockerfile path back to `/Dockerfile`
3. Remove the `apps/web/**` path ignore rule
4. Rebuild

Compute plan, ports, storage, secret groups, and runtime env are untouched.

---

## Troubleshooting

**`pnpm install` fails on `lefthook install`**
The root `package.json` has `"prepare": "lefthook install"`. The Dockerfile
passes `--ignore-scripts` for exactly this reason. If you edit the install line,
keep that flag.

**`ERR_PNPM_OUTDATED_LOCKFILE`**
The lockfile does not match the manifests. Run `pnpm install` at the repo root
and commit the result.

**Build can't find `pnpm-workspace.yaml`**
The build context is wrong. It must be the repo root (`.`), with the Dockerfile
addressed via `-f apps/bot/Dockerfile`.

**Bot starts, then exits immediately**
Missing required environment variables. `apps/bot/src/config/env.ts` requires
`DISCORD_BOT_TOKEN`, `DISCORD_RAID_LOGS_CHANNEL_ID`, `API_BASE_URL`, and
`TEMPLE_WEB_API_TOKEN`.

> ### ⚠️ Two of those come from a secret group
>
> `DISCORD_BOT_TOKEN` and `TEMPLE_WEB_API_TOKEN` are **not** in the service's
> runtime environment — only five plain variables are. They are supplied by a
> secret group.
>
> Repointing the **existing** service keeps that group attached, which is the
> main reason this runbook avoids creating a new one. If you ever do create a
> new service, link the secret group first, or the bot will fail at startup with
> a green build and no error pointing at the cause.

**Duplicate raids or threads**
Two bot instances are live. Stop the local container, or unpause exactly one
Northflank service.

---

## When it's done

- [ ] `docker build` succeeds locally
- [ ] Container runs and logs in against the real gateway
- [ ] Northflank repointed: repo + Dockerfile path
- [ ] `apps/web/` path rule added
- [ ] Service Running, gateway connected
- [ ] One real raid post → raid created + thread
- [ ] One bench message → bench updated

Then **Phase 6**: archive both old repos once you're satisfied. Archived, never
deleted — it keeps every old SHA and PR link resolving, and is reversible.
