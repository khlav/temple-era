# Legacy access booleans — remaining cleanup

Tracked as issue **#285** in the (now archived) web repo. This file is the version that
lives with the code; it was referenced by `docs/monorepo-migration-plan.md` before it existed.

## What the booleans are

`resolveUserAccess()` (`apps/web/src/server/services/access-service.ts`) resolves a user's
effective **scopes** from the `role`/`user_role` tables, then derives two compatibility
booleans from them:

| Boolean | Derived as |
|---|---|
| `isRaidManager` | holds **any** of `raidlog:manage`, `raidplan:manage`, `character:manage`, `softres:access`, `templar:access`, `api-token:access` |
| `isAdmin` | holds `userpermissions:manage` |

`isRaidManager` is therefore **broader than any single gate**. Every `/api/discord/*` write
route enforces `raidlog:manage` specifically, so a user with only `character:manage` reads
as `isRaidManager: true` and is then rejected by the route.

## What has already been done

The `packages/contracts` PR closed the gap on the bot side:

- `check-permissions` now returns `scopes` alongside `isRaidManager` (**additive** — no
  existing field changed).
- `apps/bot` gates on `raidlog:manage` from `scopes`, via
  `PermissionCheckResult.canManageRaidLogs`. It no longer reads `isRaidManager` except as a
  fallback.

## What is left

Two things must go together, and both are **breaking changes to consumers outside this repo**:

1. **`apps/bot/src/services/permissionChecker.ts`** — delete `resolveCanManageRaidLogs`'s
   fallback branch. It exists only to survive deploy skew: web (Vercel) and bot (Northflank)
   ship from the same merge through different pipelines, so a bot build that reads `scopes`
   can briefly talk to a web build that does not send them. Once a web build carrying `scopes`
   is live in production, the fallback is dead code.
2. **`packages/contracts` + `check-permissions/route.ts`** — make `scopes` required, drop
   `isRaidManager` from the response and from `CheckPermissionsResponseSchema`.

### Before dropping `isRaidManager`

`check-permissions` is not part of the OpenAPI spec and Templar does not call it, but confirm
that directly rather than assuming — check for any other consumer of
`POST /api/discord/check-permissions` holding `TEMPLE_WEB_API_TOKEN`. The token is shared
three ways (web, bot, Templar), so "the bot is the only caller" is a claim to verify, not a
given.

The booleans also remain on the `auth_user` row and in the session — removing them from the
`check-permissions` response does **not** remove them from the schema, and that is a separate,
larger piece of work.
