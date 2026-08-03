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
  `PermissionCheckResult.canManageRaidLogs`.

`apps/bot/src/services/permissionChecker.ts`'s `resolveCanManageRaidLogs` no longer falls
back to `isRaidManager` — the web route has sent `scopes` unconditionally since it shipped,
so the fallback was dead code. `scopes` is still typed `.optional()` in the contract, so the
bot guards with `?? []` (a type-level guard, not a real fallback), rather than assuming the
schema change below has already happened.

## What is left

This step is a **breaking change to consumers outside this repo**:

- **`packages/contracts` + `check-permissions/route.ts`** — make `scopes` required, drop
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
