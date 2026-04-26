# External REST API — Zone Template Management Design

**Date:** 2026-04-26
**Branch:** feature/api-plan-aa-template
**Status:** Approved

## Overview

Expose the raid-planner zone template configuration system via the v1 REST API. Parity with the `/raid-manager/raid-planner/config` UI: toggle zone active state, set default AA templates, and full CRUD for encounters and encounter groups including reordering.

Zones are hardcoded in `RAID_ZONE_CONFIG` — no zone creation or deletion via the API.

---

## Endpoints

### Zone Templates

| Method  | Path                             | Description                                                                |
| ------- | -------------------------------- | -------------------------------------------------------------------------- |
| `GET`   | `/api/v1/zone-templates`         | List all zones with template config (null template = not yet configured)   |
| `GET`   | `/api/v1/zone-templates/:zoneId` | Full zone template detail (encounters + groups)                            |
| `PATCH` | `/api/v1/zone-templates/:zoneId` | Update `isActive` and/or `defaultAATemplate`; auto-upserts template record |

### Encounters

| Method   | Path                                                     | Description                                    |
| -------- | -------------------------------------------------------- | ---------------------------------------------- |
| `POST`   | `/api/v1/zone-templates/:zoneId/encounters`              | Add encounter; auto-upserts template if needed |
| `PUT`    | `/api/v1/zone-templates/:zoneId/encounters/:encounterId` | Update encounter fields                        |
| `DELETE` | `/api/v1/zone-templates/:zoneId/encounters/:encounterId` | Delete encounter                               |
| `POST`   | `/api/v1/zone-templates/:zoneId/encounters/reorder`      | Atomic bulk reorder + group assignment         |

### Encounter Groups

| Method   | Path                                             | Description                                                           |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `POST`   | `/api/v1/zone-templates/:zoneId/groups`          | Create group; auto-upserts template if needed                         |
| `PUT`    | `/api/v1/zone-templates/:zoneId/groups/:groupId` | Update group name                                                     |
| `DELETE` | `/api/v1/zone-templates/:zoneId/groups/:groupId` | Delete group (`?mode=promote\|deleteChildren`, defaults to `promote`) |

---

## Request / Response Shapes

### `GET /api/v1/zone-templates`

Response: array of zone rows. Zones without a template record return `template: null`.

```json
[
  {
    "zoneId": "naxxramas",
    "zoneName": "Naxxramas",
    "defaultGroupCount": 8,
    "template": {
      "id": "<uuid>",
      "isActive": true,
      "defaultAATemplate": "...",
      "encounters": [...],
      "encounterGroups": [...]
    }
  },
  {
    "zoneId": "aq40",
    "zoneName": "Ahn'Qiraj",
    "defaultGroupCount": 8,
    "template": null
  }
]
```

### `GET /api/v1/zone-templates/:zoneId`

Same shape as the single zone entry above. 404 if `zoneId` is not in `RAID_ZONE_CONFIG`.

### `PATCH /api/v1/zone-templates/:zoneId`

Body (all optional, at least one required):

```json
{
  "isActive": true,
  "defaultAATemplate": "{tank}Tank1\n{healer}Healer1"
}
```

Auto-upserts the template record using `RAID_ZONE_CONFIG` to derive `zoneName`, `defaultGroupCount`, and `sortOrder`. Returns updated template fields + `availableSlots`.

### `POST /api/v1/zone-templates/:zoneId/encounters`

```json
{ "encounterName": "Patchwerk", "groupId": "<uuid-or-null>" }
```

Returns the new encounter. Auto-upserts template if needed.

### `PUT /api/v1/zone-templates/:zoneId/encounters/:encounterId`

Body (all optional, at least one required):

```json
{
  "encounterName": "Patchwerk",
  "aaTemplate": "{tank}MT\n{healer}H1",
  "sortOrder": 3,
  "groupId": "<uuid-or-null>"
}
```

Regenerates `encounterKey` when `encounterName` changes. Returns `{ success: true }`.

### `DELETE /api/v1/zone-templates/:zoneId/encounters/:encounterId`

Returns `{ success: true }`.

### `POST /api/v1/zone-templates/:zoneId/encounters/reorder`

Atomic — updates group sort orders and encounter sort orders + groupId assignments in a single transaction. Matches `reorderEncounterGroups` tRPC mutation exactly.

```json
{
  "groups": [{ "id": "<uuid>", "sortOrder": 0 }],
  "encounters": [
    { "id": "<uuid>", "sortOrder": 1, "groupId": "<uuid-or-null>" }
  ]
}
```

Returns `{ success: true }`.

### `POST /api/v1/zone-templates/:zoneId/groups`

```json
{ "groupName": "Spider Wing" }
```

Returns the new group. Sort order computed as max across encounters + groups + 1.

### `PUT /api/v1/zone-templates/:zoneId/groups/:groupId`

```json
{ "groupName": "Spider Wing" }
```

Returns `{ success: true }`.

### `DELETE /api/v1/zone-templates/:zoneId/groups/:groupId?mode=promote|deleteChildren`

- `promote` (default): sets `groupId = null` on child encounters, keeps them
- `deleteChildren`: deletes all child encounters, then deletes the group

Returns `{ success: true }`.

---

## Validation & Auth

- All endpoints require `isRaidManager`
- `zoneId` validated against `RAID_ZONE_CONFIG` keys — 404 if unknown
- `encounterId` and `groupId` validated to belong to the zone's template before any mutation — 404 if not found or mismatched
- Encounter/group ID validation uses a single ownership check query (join or where-clause check against `templateId`)

---

## File Structure

```
src/app/api/v1/zone-templates/
  route.ts                              GET (list all)
  [zoneId]/
    route.ts                            GET (detail), PATCH
    encounters/
      route.ts                          POST (add), POST reorder (handled here via action param or separate file)
      reorder/
        route.ts                        POST (bulk reorder)
      [encounterId]/
        route.ts                        PUT, DELETE
    groups/
      route.ts                          POST (create)
      [groupId]/
        route.ts                        PUT, DELETE
```

---

## OpenAPI

All endpoints registered in `src/lib/openapi-registry.ts` under the `"Zone Templates"` tag.

| Endpoint                                                 | operationId                     |
| -------------------------------------------------------- | ------------------------------- |
| `GET /zone-templates`                                    | `listZoneTemplates`             |
| `GET /zone-templates/:zoneId`                            | `getZoneTemplate`               |
| `PATCH /zone-templates/:zoneId`                          | `patchZoneTemplate`             |
| `POST /zone-templates/:zoneId/encounters`                | `addZoneTemplateEncounter`      |
| `PUT /zone-templates/:zoneId/encounters/:encounterId`    | `updateZoneTemplateEncounter`   |
| `DELETE /zone-templates/:zoneId/encounters/:encounterId` | `deleteZoneTemplateEncounter`   |
| `POST /zone-templates/:zoneId/encounters/reorder`        | `reorderZoneTemplateEncounters` |
| `POST /zone-templates/:zoneId/groups`                    | `createZoneTemplateGroup`       |
| `PUT /zone-templates/:zoneId/groups/:groupId`            | `updateZoneTemplateGroup`       |
| `DELETE /zone-templates/:zoneId/groups/:groupId`         | `deleteZoneTemplateGroup`       |

---

## Auto-Upsert Behavior

Write endpoints that operate on a zone (`PATCH`, `POST .../encounters`, `POST .../groups`) auto-create the template record when it doesn't exist, using `RAID_ZONE_CONFIG` to derive:

- `zoneName` from the config entry
- `defaultGroupCount` from `getGroupCount(zoneId)`
- `sortOrder` from the index in `RAID_ZONE_CONFIG`
- `isActive: true` as the default

This mirrors the UI behavior where adding the first encounter to an unconfigured zone initializes the template.
