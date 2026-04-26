# External REST API — Stage 3b Design: Raid Plan Writes

**Date:** 2026-04-26
**Status:** Approved, pending implementation

## Context

Stage 3a delivered read-only raid plan endpoints. Stage 3b adds the write operations needed to automate the Sunday-night planning workflow: create a plan for an upcoming event, sync the current Raid Helper signups into the roster, set group assignments in bulk, adjust encounter settings, and assign AA slots.

All Stage 3b endpoints require `isRaidManager = true`. The `|| isAdmin` exception does **not** apply here, consistent with Stage 3a.

---

## Stage 3a Enhancement — Available AA Slot Names

`GET /api/v1/raid-plans/:id` (already implemented) gains two additions to its response:

- Top-level: `availableSlots: string[]` — slot names parsed from `defaultAATemplate` using `getSlotNames()` from `~/lib/aa-template`. Empty array if no default AA template is set.
- Per encounter (in the `encounters` array): `availableSlots: string[]` — slot names parsed from that encounter's `aaTemplate`. Empty array if no template.

This gives a script everything it needs in one call to know what AA slot names exist before making bulk assignments.

**Implementation:** Import `getSlotNames` from `~/lib/aa-template` in `src/app/api/v1/raid-plans/[id]/route.ts`. Call it on `p.defaultAATemplate` and on each encounter's `aaTemplate` before returning the response. Pass `null` and `undefined` safely — `getSlotNames(null ?? "")` returns `[]`.

**OpenAPI:** Update `RaidPlanDetailSchema` in `src/lib/openapi-registry.ts` to add `availableSlots: z.array(z.string())` at the top level, and update `EncounterSchema` to include `availableSlots: z.array(z.string())`.

---

## New Endpoints

### `POST /api/v1/raid-plans`

Creates a plan shell for a Raid Helper event. Does not populate the roster — use `sync-signups` after creation.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
{
  "raidHelperEventId": "1234567890",
  "name": "MC Tuesday",
  "zoneId": "moltencore",
  "startAt": "2026-04-29T23:00:00Z",
  "cloneFromPlanId": null
}
```

- `raidHelperEventId` — required
- `name` — required, 1–256 chars
- `zoneId` — required, 1–64 chars
- `startAt` — optional ISO datetime string
- `cloneFromPlanId` — optional UUID; if provided, copies encounter structure and AA settings from that plan

**Implementation:**

- Returns 409 if a plan already exists for `raidHelperEventId`
- Wraps the tRPC `create` logic directly (insert into `raidPlans`, optionally clone encounter structure in a transaction)
- `characters` array passed to `create` is always empty — roster is populated separately

**Response `201`:**

```json
{
  "id": "uuid",
  "name": "MC Tuesday",
  "zoneId": "moltencore",
  "raidHelperEventId": "1234567890",
  "startAt": "2026-04-29T23:00:00.000Z"
}
```

**Errors:** 400 (validation), 401, 403, 409 (plan already exists for event)

---

### `POST /api/v1/raid-plans/:id/sync-signups`

Fetches current signups from the Raid Helper API and refreshes the plan's roster. The caller does not supply characters — the endpoint fetches and resolves them internally.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
{ "mode": "addNewSignupsToBench" }
```

- `mode` — optional, `"addNewSignupsToBench"` (default) or `"fullReimport"`
  - `addNewSignupsToBench`: adds new signups as benched characters, never removes existing, never moves positions
  - `fullReimport`: replaces the roster completely, resets all custom encounter groups to default

**Implementation:**

1. Fetch plan from DB to get `raidHelperEventId` (404 if not found)
2. If `raidHelperEventId` is null: return 400 (`"Plan has no linked Raid Helper event"`)
3. Fetch event from Raid Helper: `GET /v4/events/{raidHelperEventId}` with `Authorization: RAID_HELPER_API_KEY`. Return 502 if unavailable.
4. **Resolve `lastEventId`:** If the response has no `signUps` but has a `lastEventId`, re-fetch using that ID instead. Recurring/scheduled events in Raid Helper use this pattern — the channel event ID has no signups; the actual instance does. (Same logic as `getEventDetails` tRPC procedure at `src/server/api/routers/raid-helper.ts:537`.)
5. **Reconcile signups → characters:** The UI calls `matchSignupsToCharacters` (at `src/server/api/routers/raid-helper.ts:683`) which does full reconciliation — not just name matching. The REST endpoint must run equivalent logic:
   - Filter out bench/absent/tentative/late signups using `resolveClassName`
   - Look up each signup's `userId` against the `accounts` + `users` join to find the linked character (highest-confidence match)
   - For unmatched signups, do normalized name fuzzy matching against all non-ignored characters in the DB (same `normalizeName` + `extractNormalizedTokens` logic)
   - Produce `{ characterId: number | null, characterName: string, defaultGroup: null, defaultPosition: null, writeInClass: string | null }` per signup
   - **Implementation note:** Extract the core matching logic from `matchSignupsToCharacters` into a shared helper `src/server/api/helpers/match-signups.ts` callable from both the tRPC procedure and this REST route — do not duplicate it.
6. Execute the refresh transaction using the resolved character list (see `refreshCharacters` in `src/server/api/routers/raid-plan.ts:2389` for full logic — two-pass match against existing roster, insert/update/delete accordingly)
7. Touch `updatedById` on the plan

**Response `200`:**

```json
{ "added": 5, "updated": 38, "removed": 0 }
```

**Errors:** 400 (no linked event), 401, 403, 404, 502 (Raid Helper unavailable)

---

### `PUT /api/v1/raid-plans/:id/roster`

Bulk-patches default group/position assignments for multiple characters in a single transaction. Characters not listed are untouched.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
[
  { "planCharacterId": "uuid", "group": 0, "position": 2 },
  { "planCharacterId": "uuid", "group": null, "position": null }
]
```

- `group`: integer 0–7 or null (bench)
- `position`: integer 0–4 or null (bench)
- Array must have at least 1 item, max 200

**Implementation:**

- Verify plan exists (404 if not)
- For each item, `UPDATE raidPlanCharacters SET defaultGroup, defaultPosition WHERE id = planCharacterId` — runs inside a single transaction
- Characters with IDs not belonging to this plan are silently skipped (no error — this keeps the bulk op idempotent)
- Touch `updatedById` on plan after transaction

**Response `200`:**

```json
{ "updated": 12 }
```

**Errors:** 400 (validation), 401, 403, 404

---

### `PATCH /api/v1/raid-plans/:id/roster/:planCharacterId`

Updates the character link on a single roster slot. Use this to resolve an ambiguous signup match — e.g., a write-in that sync-signups couldn't confidently bind to a DB character.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
{ "characterId": 456 }
```

- `characterId` — required, integer; must be a valid character in the DB

**Implementation:**

- Verify the plan exists (404 if not)
- Verify `planCharacterId` belongs to this plan (404 if not)
- Verify `characterId` exists in the `characters` table (400 if not found)
- `UPDATE raidPlanCharacters SET characterId = ?, characterName = characters.name WHERE id = planCharacterId`
- Touch `updatedById` on the plan

**Response `200`:**

```json
{ "success": true }
```

**Errors:** 400 (invalid characterId), 401, 403, 404

---

### `PUT /api/v1/raid-plans/:id/encounters/:encounterId`

Updates settings on a single encounter. All fields optional — only provided fields are changed.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
{
  "useDefaultGroups": false,
  "aaTemplate": "...",
  "useCustomAA": true,
  "encounterName": "Lucifron"
}
```

**Implementation:**

- Verify encounter belongs to this plan (404 if encounter not found or plan ID mismatch)
- Wraps `updateEncounter` tRPC logic exactly:
  - When `aaTemplate` changes: deletes orphaned AA slot assignments for slots no longer in the template
  - When `useDefaultGroups` transitions `true → false`: seeds encounter assignments from current default groups (if no custom assignments exist yet)
- Touch `updatedById` on plan

**Response `200`:**

```json
{ "success": true }
```

**Errors:** 400 (no fields provided, or validation), 401, 403, 404

---

### `PUT /api/v1/raid-plans/:id/encounters/:encounterId/roster`

Bulk-patches per-encounter group assignments. Only applies when `useDefaultGroups = false` on the encounter. Characters not listed are untouched.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
[
  { "planCharacterId": "uuid", "group": 1, "position": 0 },
  { "planCharacterId": "uuid", "group": null, "position": null }
]
```

- Same field shapes as default roster
- Array must have at least 1 item, max 200

**Implementation:**

- Verify encounter belongs to this plan (404 if not)
- For each item: upsert into `raidPlanEncounterAssignments` — `UPDATE ... WHERE encounterId = X AND planCharacterId = Y`, insert if no rows updated (same pattern as `moveEncounterCharacter`)
- Runs in a single transaction
- Touch `updatedById` on plan

**Response `200`:**

```json
{ "updated": 8 }
```

**Errors:** 400, 401, 403, 404

---

### `PUT /api/v1/raid-plans/:id/aa-slots`

Bulk-assigns characters to AA slots. Merge semantics: upserts by `(slotName, encounterId)` — slots not mentioned are left untouched.

**Auth:** Bearer + `isRaidManager`

**Request body:**

```json
[
  { "slotName": "Main Tank", "planCharacterId": "uuid", "encounterId": null },
  {
    "slotName": "Tranq 1",
    "planCharacterId": "uuid",
    "encounterId": "encounter-uuid"
  }
]
```

- `encounterId: null` — plan-level default AA slot (linked to `raidPlanId`)
- `encounterId: "uuid"` — encounter-specific AA slot
- Array must have at least 1 item, max 200

**Implementation:**

- Verify plan exists (404)
- For each item: check if `(planCharacterId, slotName, encounterId)` already exists — if so, no-op. Otherwise insert with `sortOrder = max existing sort order for that slot + 1`. Same logic as `assignCharacterToAASlot` tRPC procedure.
- Runs serially (not in a parallel Promise.all) to preserve sort order correctness
- Touch `updatedById` on plan after all inserts

**Response `200`:**

```json
{ "assigned": 3, "skipped": 1 }
```

- `assigned`: rows inserted
- `skipped`: rows that already existed (no-op)

**Errors:** 400, 401, 403, 404

---

## Auth

Same `validateApiToken` helper as all `/api/v1/` routes. Each handler checks:

```ts
if (!user.isRaidManager) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

`isAdmin` does **not** bypass this check.

---

## OpenAPI Updates

Add to `src/lib/openapi-registry.ts`:

- Update `RaidPlanDetailSchema` — add `availableSlots: z.array(z.string())`
- Update `EncounterSchema` — add `availableSlots: z.array(z.string())`
- `CreatePlanSchema` — request body for POST /api/v1/raid-plans
- `SyncSignupsSchema` — request body for sync-signups
- `RosterPatchSchema` — request body for bulk roster endpoints
- `RosterCharacterPatchSchema` — request body for PATCH single roster slot
- `AASlotAssignRequestSchema` — request body for bulk AA slots
- Register all 7 new paths + the modified GET /api/v1/raid-plans/{id} response

---

## Files to Touch

| File                                                                      | Change                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/server/api/helpers/match-signups.ts`                                 | New — signup→character reconciliation helper      |
| `src/server/api/routers/raid-helper.ts`                                   | Refactor `matchSignupsToCharacters` to use helper |
| `src/app/api/v1/raid-plans/[id]/route.ts`                                 | Add `availableSlots` to response                  |
| `src/app/api/v1/raid-plans/route.ts`                                      | Add POST handler                                  |
| `src/app/api/v1/raid-plans/[id]/sync-signups/route.ts`                    | New — POST handler                                |
| `src/app/api/v1/raid-plans/[id]/roster/route.ts`                          | New — PUT handler                                 |
| `src/app/api/v1/raid-plans/[id]/roster/[planCharacterId]/route.ts`        | New — PATCH handler                               |
| `src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/route.ts`        | New — PUT handler                                 |
| `src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/roster/route.ts` | New — PUT handler                                 |
| `src/app/api/v1/raid-plans/[id]/aa-slots/route.ts`                        | New — PUT handler                                 |
| `src/lib/openapi-registry.ts`                                             | Update schemas + register 6 new paths             |

---

## Staging

| Stage     | Scope                                                                    |
| --------- | ------------------------------------------------------------------------ |
| 1 (done)  | Read-only: character search & attendance                                 |
| 2 (done)  | Write: character family management                                       |
| 3a (done) | Read: upcoming events + raid plan detail                                 |
| 3b (this) | Write: create plan, sync signups, bulk roster/group management, AA slots |
