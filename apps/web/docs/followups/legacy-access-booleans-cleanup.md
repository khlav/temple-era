# Follow-up: remove the legacy `isRaidManager` / `isAdmin` compatibility layer

**Status:** deferred — suggested to land *after* the monorepo migration.
**Context:** the scopes-enforcement rework (PR #284) migrated every **authorization decision** in
the codebase onto explicit scope checks. What remains are *display* reads and *API contract*
surfaces. None of them grant or deny access.

## Why this is safe to defer

As of PR #284 there are **zero** authorization gates reading `isRaidManager` / `isAdmin`. Verified by:

```bash
grep -rnE 'if \(!?[a-zA-Z_?.]*\.(isRaidManager|isAdmin)' src/server src/app   # -> no matches
```

The booleans are still *derived* in `resolveUserAccess()` (`src/server/services/access-service.ts`)
via `LEGACY_RAID_MANAGER_SCOPES` / `LEGACY_ADMIN_SCOPES`, and still *populated* on the session, the
v1 `/me` payload, and the v2 GraphQL `User` type — but nothing gates on them.

Because of that, this cleanup is now close to a **pure deletion**: no guard has to change.

## ⚠️ The one real wart to fix when doing this

`deriveLegacyFlags()` computes `isRaidManager` with `.some()` over the whole scope bundle:

```ts
isRaidManager: LEGACY_RAID_MANAGER_SCOPES.some((s) => scopeSet.has(s))
```

So holding **any single** bundled scope (even `templar:access`) makes `isRaidManager` true.
That is harmless today because nothing authorizes on it — but any new code that reads the boolean
inherits an over-permissive check. This is the strongest argument for deleting the layer rather
than living with it indefinitely.

`isAdmin` does **not** have this problem: `LEGACY_ADMIN_SCOPES` is exactly
`[SCOPE.USERPERMISSIONS_MANAGE]`, a faithful 1:1 mapping.

## Work items

### 1. Display-only reads (~38) — swap to scope checks
These decide what UI to render. Over-permissive today (see wart above): a user holding only
`templar:access` sees raid-manager nav entries and edit buttons whose actions correctly fail.

- `components/nav/app-header.tsx` (5)
- `components/ui/global-quick-launcher.tsx` (4)
- `components/raids/raids-table.tsx` (4), `components/characters/characters-table.tsx` (5)
- `components/raid-planner/public-plans-table.tsx` (2), `raid-plan-public-view.tsx` (3)
- `components/profile/api-access-card.tsx` (2)
- `app/providers.tsx` (2)
- `showEditButton=` / `isRaidManager=` props in `app/raids/page.tsx`,
  `app/raids/[raidId]/page.tsx`, `app/raid-plans/[planId]/page.tsx`,
  `app/characters/[characterId]/page.tsx`

**Highest-value item here:** `profile.ts`'s `getMyProfile` reads `isRaidManager`/`isAdmin` off the
**flat `auth_user` columns**, not from `resolveUserAccess()`. `api-access-card.tsx:94` gates on
those, so a user can be shown the API-token card while `generateApiToken`
(`SCOPE.API_TOKEN_ACCESS`) rejects them. Fix: have `getMyProfile` return resolved `scopes` and gate
the card on `SCOPE.API_TOKEN_ACCESS`.

### 2. API contract surfaces — need a version/consumer decision, not just a refactor
These are **published fields**. Removing them is a breaking change for the Discord bot and any
external API consumer, so they need coordination rather than a silent edit.

- `GET /api/v1/me` response body (`app/api/v1/me/route.ts:32-33`)
- `PATCH /api/v1/me/templar` response body (`app/api/v1/me/templar/route.ts`) — note it returns the
  **flat column** values, which can contradict the scope-derived values `validateApiToken` returns
  a few lines earlier. Worth fixing even if the fields stay.
- v2 GraphQL `User.isRaidManager` / `User.isAdmin` (`server/api/v2/types/user.ts`,
  `schema.ts`, `context.ts`)
- `POST /api/discord/check-permissions` response (consumed by the Discord bot)
- ~32 `Requires isRaidManager` description strings in `lib/openapi-registry.ts` — accurate today,
  will drift as consumers move to scopes

Suggested path: expose `scopes` alongside the booleans first, let consumers migrate, then drop the
booleans in a versioned release.

### 3. Plumbing — delete last, once 1 and 2 are done
- `LEGACY_RAID_MANAGER_SCOPES`, `LEGACY_ADMIN_SCOPES`, `deriveLegacyFlags()`, and the
  `isRaidManager`/`isAdmin` fields on `UserAccess` (`services/access-service.ts`)
- `isRaidManager` / `isAdmin` on the NextAuth session type (`server/auth/config.ts`)
- `isRaidManager` / `isAdmin` on `DiscordRouteUser` (`server/api/discord-trpc-caller.ts`)
- `v1-auth.ts`'s returned `isRaidManager` / `isAdmin`
- **DB:** drop `auth_user.is_raid_manager` and `auth_user.is_admin`. Kept deliberately as a rollback
  net for the 0025/0026 role backfill. Do not drop until the role/`user_role` data has been stable
  in production for a while — they are the only remaining record of pre-migration access.

## Suggested order

1. Item 1 (display) — self-contained, no external impact.
2. Item 2 (contract) — needs bot/API-consumer coordination.
3. Item 3 (plumbing + column drop) — only once nothing reads them.
