# External REST API — Stage 3a Design: Raid Plan Reads

**Date:** 2026-04-26  
**Status:** Approved, pending implementation

## Context

Stage 2 delivered character family write operations. Stage 3 covers raid plan management — the full Sunday-night workflow of finding an upcoming event, creating or loading a plan, and setting the roster and assignments.

Stage 3 is split into two sub-stages:

- **3a (this):** Read-only — list upcoming events, list recent plans, get full plan detail
- **3b:** Writes — create plan, sync signups, move characters to groups, update encounters, assign AA slots

All Stage 3a endpoints require `isRaidManager = true` on the authenticated user's token. The `|| isAdmin` exception used in Stage 2 does **not** apply here.

## Endpoints

### `GET /api/v1/events`

Lists upcoming Discord events from Raid Helper, each annotated with whether a raid plan already exists for that event.

**Auth:** Bearer + `isRaidManager`

**Query params:**

- `hoursBack` (optional, default `0`): include events that started up to N hours ago (same as `allowableHoursPastStart` in the tRPC layer)

**Implementation:**

- Calls Raid Helper API: `GET /v4/servers/{DISCORD_SERVER_ID}/events` using `RAID_HELPER_API_KEY`
- Fetches each event's detail to get role counts (same as `getScheduledEvents` tRPC procedure)
- Calls `raidPlan.getExistingPlansForEvents(eventIds)` to annotate with plan status
- Returns events sorted by `startTime` ascending

**Response `200`:**

```json
[
  {
    "id": "1234567890",
    "title": "Temple MC Tuesday",
    "displayTitle": "MC Tuesday",
    "startTime": 1747180800,
    "signUpCount": 42,
    "roleCounts": { "Tank": 4, "Healer": 9, "Melee": 14, "Ranged": 15 },
    "existingPlan": { "id": "uuid", "lastModifiedAt": "2026-04-29T22:00:00Z" }
  }
]
```

`existingPlan` is `null` if no plan exists for this event. `displayTitle` may be `null` if the event has no custom display title set.

**Errors:** 401 (auth), 403 (not raid manager), 502 (Raid Helper API unavailable)

---

### `GET /api/v1/raid-plans`

Returns recent raid plans sorted by last-modified descending. Thin list — no roster or encounter detail.

**Auth:** Bearer + `isRaidManager`

**Query params:**

- `limit` (optional, default `20`, max `50`)

**Implementation:**

- Queries `raidPlans` table ordered by `updatedAt DESC`, limited to `limit` rows
- Joins `users` for `lastEditor` name

**Response `200`:**

```json
[
  {
    "id": "uuid",
    "name": "MC Tuesday",
    "zoneId": "moltencore",
    "raidHelperEventId": "1234567890",
    "startAt": "2026-04-29T23:00:00Z",
    "isPublic": false,
    "lastModifiedAt": "2026-04-28T14:30:00Z"
  }
]
```

**Errors:** 401, 403

---

### `GET /api/v1/raid-plans/:id`

Full plan detail — everything needed to understand the current state of a plan: roster with default group assignments, encounters, per-encounter custom assignments, and all AA slot assignments.

**Auth:** Bearer + `isRaidManager`

**Implementation:**

- Queries `raidPlans` by `id` (UUID)
- Joins `raidPlanCharacters`, `raidPlanEncounterGroups`, `raidPlanEncounters`, `raidPlanEncounterAssignments`, `raidPlanEncounterAASlots` in a single relational query
- `encounterAssignments` only includes rows for encounters where `useDefaultGroups = false`

**Response `200`:**

```json
{
  "id": "uuid",
  "name": "MC Tuesday",
  "zoneId": "moltencore",
  "raidHelperEventId": "1234567890",
  "startAt": "2026-04-29T23:00:00Z",
  "isPublic": false,
  "defaultAATemplate": "...",
  "useDefaultAA": true,
  "characters": [
    {
      "id": "plan-char-uuid",
      "characterId": 12345,
      "characterName": "Khlav",
      "class": "Warrior",
      "defaultGroup": 0,
      "defaultPosition": 0
    }
  ],
  "encounterGroups": [
    { "id": "uuid", "groupName": "Core Hounds", "sortOrder": 0 }
  ],
  "encounters": [
    {
      "id": "uuid",
      "encounterName": "Lucifron",
      "encounterKey": "lucifron",
      "groupId": "uuid",
      "sortOrder": 0,
      "useDefaultGroups": true,
      "useCustomAA": false,
      "aaTemplate": null
    }
  ],
  "encounterAssignments": [
    {
      "encounterId": "uuid",
      "planCharacterId": "plan-char-uuid",
      "groupNumber": 1,
      "position": 2
    }
  ],
  "aaSlotAssignments": [
    {
      "id": "uuid",
      "encounterId": "uuid",
      "raidPlanId": null,
      "planCharacterId": "plan-char-uuid",
      "slotName": "Main Tank"
    }
  ]
}
```

**Errors:** 401, 403, 404 (plan not found)

---

## Auth

Same `validateApiToken` helper as all `/api/v1/` routes. Each handler checks:

```ts
if (!user.isRaidManager) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Note: `isAdmin` does **not** bypass this check for Stage 3a endpoints.

---

## OpenAPI Updates

Add to `src/lib/openapi-registry.ts`:

- `EventSchema` — individual event in the events list
- `RaidPlanSummarySchema` — individual plan in the plan list
- `RaidPlanDetailSchema` — full plan detail (with nested schemas for characters, encounters, etc.)
- Register all three paths with `BearerToken` security and `isRaidManager` noted in description

---

## Files to Touch

| File                                      | Change                  |
| ----------------------------------------- | ----------------------- |
| `src/app/api/v1/events/route.ts`          | New — GET handler       |
| `src/app/api/v1/raid-plans/route.ts`      | New — GET handler       |
| `src/app/api/v1/raid-plans/[id]/route.ts` | New — GET handler       |
| `src/lib/openapi-registry.ts`             | Add new schemas + paths |

---

## Staging

| Stage     | Scope                                                               |
| --------- | ------------------------------------------------------------------- |
| 1 (done)  | Read-only: character search & attendance                            |
| 2 (done)  | Write: character family management                                  |
| 3a (this) | Read: upcoming events + raid plan detail                            |
| 3b        | Write: create plan, sync signups, roster/group management, AA slots |
