# External REST API — Stage 2 Design: Character Family Management

**Date:** 2026-04-26  
**Status:** Approved, pending implementation

## Context

Stage 1 delivered read-only character search and attendance endpoints. Stage 2 adds write operations for managing character families (primary/secondary relationships). The primary use case is Claude being able to associate alt characters with a player's main, or unlink a character that was incorrectly grouped.

All write endpoints require `isRaidManager = true` on the authenticated user's token.

## Endpoints

### `PUT /api/v1/characters/:primaryId/secondaries`

Sets secondary characters for a primary. Requires `isRaidManager`.

**Request body:**

```json
{
  "secondaryIds": [123, 456],
  "mode": "replace" | "append"
}
```

- `replace` (default): clears all existing secondaries for this primary and sets the new list. Wraps the existing `updatePrimaryCharacter` DB logic from `character.ts`.
- `append`: fetches current secondaries, merges with incoming IDs (deduped), then runs the same replace logic with the combined list.

**Validation:**

- `primaryId` must be a valid integer and the character must exist
- Target character must have `isPrimary = true` (i.e. it is already a primary, not a secondary itself)
- `secondaryIds` must be non-empty array of integers
- None of the secondaryIds should equal the primaryId

**Response `200`:**

```json
{
  "primaryCharacterId": 123,
  "secondaryCharacters": [
    {
      "characterId": 456,
      "name": "Althlav",
      "class": "Rogue",
      "server": "Mankrik"
    }
  ]
}
```

**Errors:** 400 (invalid input), 401 (auth), 403 (not raid manager), 404 (primary not found)

---

### `DELETE /api/v1/characters/:id/primary`

Removes a character from its primary family, making it standalone. Requires `isRaidManager`.

**Implementation:** Single `UPDATE characters SET primary_character_id = NULL WHERE character_id = :id`. No lookups needed — `isPrimary` is a generated column and updates automatically.

**Validation:**

- Character must exist
- Character must currently have a `primaryCharacterId` set (i.e. it is actually a secondary — otherwise it's a no-op or error)

**Response `200`:**

```json
{ "characterId": 456, "name": "Althlav" }
```

**Errors:** 400 (not a secondary / no primary to unlink), 401, 403, 404

---

## Auth

Same pattern as Stage 1 `validateApiToken`, plus an explicit `isRaidManager` check in each handler:

```ts
if (!user.isRaidManager && !user.isAdmin) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

---

## OpenAPI Updates

Add to `src/lib/openapi-registry.ts`:

- `FamilyUpdateSchema` — request body for PUT secondaries
- `FamilyResponseSchema` — response for PUT secondaries
- Register both new paths with `BearerToken` security and `isRaidManager` noted in description

---

## Files to Touch

| File                                                  | Change                  |
| ----------------------------------------------------- | ----------------------- |
| `src/app/api/v1/characters/[id]/secondaries/route.ts` | New — PUT handler       |
| `src/app/api/v1/characters/[id]/primary/route.ts`     | New — DELETE handler    |
| `src/lib/openapi-registry.ts`                         | Add new schemas + paths |

## Staging

| Stage    | Scope                                    |
| -------- | ---------------------------------------- |
| 1 (done) | Read-only: character search & attendance |
| 2 (this) | Write: character family management       |
| 3        | Write: raid plan CRUD                    |
