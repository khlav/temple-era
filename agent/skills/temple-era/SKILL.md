---
name: temple-era
description: "Temple Raids API — WoW Classic guild raid management for temple-era.com. How to read and write Temple data (GraphQL v2, REST v1, read-only SQL), how to discover what exists, and the pitfalls learned so far."
version: 4.0.0
---

# Temple Era — Temple Raids API

Two APIs exist. **GraphQL v2 is primary — start there for every task.** REST v1 is secondary: use it only for what GraphQL can't do (mutations/writes, a handful of REST-only endpoints), and avoid looping over it.

| | GraphQL v2 | REST v1 |
|---|---|---|
| Base | `https://www.temple-era.com/api/v2/graphql` (`POST`; SDL at `/api/v2/graphql/schema.graphql`) | `https://www.temple-era.com/api/v1` |
| Role | Reads: attendance, rosters, raids, recipes, rankings — batchable via aliases | Writes: create/update/delete plans, raids, templates, roster patches, AA slots, toggles |
| Auth | Bearer API token of the acting user (all endpoints) | Same token; Raid Planning/Templates also need `isRaidManager` |

---

## Finding out what exists — check before saying "no"

Three read-only calls answer "can I get X?" without loading the full spec (which is ~150 KB, over the tool response cap — never try to read it whole):

- `GET /api/v1/capabilities` — every data domain Temple keeps, whether it is stored, and which surfaces can read it (REST / GraphQL / SQL), plus which write routes *this* user's scopes allow. **Run this before telling anyone Temple "doesn't store X"** — it separates *not stored* (SoftRes is fetched live) from *stored but not readable* (signup history) from *readable* (achievements, via GraphQL or SQL).
- `GET /api/v1/endpoints?q=achievement` — one line per REST route: method, path, summary, tags, auth, required scopes. `q` takes several words (all must match); `tag=` and `method=` narrow it. Routes that are deliberately outside the OpenAPI document (e.g. `POST /softres`) are listed with `inSpec: false`.
- `GET /api/v1/endpoints/spec?tag=Raids` — the OpenAPI document cut to one tag, small enough to read whole. A wrong tag returns the list of valid ones.

For GraphQL, the SDL at `/api/v2/graphql/schema.graphql` is the full schema; field descriptions say what is not obvious (e.g. that achievements belong to the primary character).

## GraphQL v2 API — start here for everything read-related

### Always inspect the schema first

Fetch the schema (the SDL at `/api/v2/graphql/schema.graphql`) **at the start of any session before writing a query** — even ones covered below. The schema evolves and is the source of truth for what's possible; never rely on a cached or remembered shape. If you're not sure whether a field/query exists, introspect rather than guessing or falling back to REST.

### Default philosophy: batch, don't iterate

GraphQL supports aliases, so most "for each X, look up Y" tasks that would otherwise mean N sequential REST calls collapse into one or a few batched queries (see the ranking recipe below for the pattern). Prefer this over looping calls of any kind — REST or GraphQL.

### Big analysis jobs — fix the query shape first

For anything beyond a simple lookup — guild-wide rankings, full log scans, multi-step aggregation, cross-referencing many characters/raids — prefer **one** batched GraphQL query or **one** SQL query over many rounds of small calls.

If the work is handed to another worker or sub-process: state the exact query shape and fields to use (don't let it reconstruct them from memory — see the ranking pitfalls below for what goes wrong when it does), name any forbidden fields explicitly, and check what it actually ran before trusting its numbers. Keep each worker scoped (e.g. ≤ 8 query chunks) — long parallel scans can get interrupted.

### Character attendance — default to family

When someone asks about a character's attendance, **default to the whole family** (primary + all alts). Most questions mean "across all their characters," not just one toon. Use `characterFamilies` unless the user explicitly asks about a specific character only.

### ⚠️ weeksTracked is NOT tenure

The REST `/characters/{id}/attendance` endpoint always shows `weeksTracked: 18` (or similar) regardless of how long someone has been raiding. This is the endpoint's rolling window size, NOT how long the character has been in the guild. A player raiding since 2024 and a brand new player both show `weeksTracked: 18`. **Never use this field to determine if someone is a new or established raider.**

To check tenure, use GraphQL `characterFamilies.attendance(from: ..., to: ...)` with a date range going far enough back, and scan for the first `ATTENDED` or `BENCH` entry. See `references/talent-scouting.md` for the full workflow.

### Two-step lookup pattern

Most attendance questions require a name → ID step first:

```graphql
# Step 1 — resolve name to primary character ID
query { characters(search: "Dunckan", type: PRIMARY) { id name } }

# Step 2 — family attendance across all alts (default)
query {
  characterFamilies(primaryCharacterIds: [<id>]) {
    primary { name }
    secondaries { name }
    attendance(from: "2026-01-01") { status raid { date name zone } }
  }
}
```

### Guild-wide ranking — "most raids" leaderboards

⚠️ **Load `references/guild-leaderboards.md` and copy its query shapes verbatim before writing any ranking query — never reconstruct from memory.** Golden rules: `from: "2000-01-01"` (else windowed, not all-time), `includeFamily: true` on the primary's `attendedCount` call (correctly dedupes a raid where two of a person's characters both attended — do NOT manually sum primary+secondaries, that double-counts). For `zones:`, **ask the user first** whether they want 40-man raids only (MC/BWL/AQ40/Naxx) or to include 20-man/other raids too (AQ20/ZG/Onyxia) — don't silently pick one.

No leaderboard/orderBy query exists in the schema — rank client-side.

⚠️ **`attendedCount` overcounts long-tenured characters vs the character tab.** Confirmed: Rogand 505→246, Beeseajay 452→218, bcjlock 46→35. The tab counts WCL log appearances; the API counts roster records, which can mark chars attended/bench on raids where they're not in the log. Short-tenure chars and most alts match 1:1 — a clean spot-check on one family proves nothing about veterans. Every family in a ranking needs its own verification (user's tab readout, or a `logs.attendees` scan) before presenting as final. Verify per-character ID↔name pairing via `characters(search:)` — an earlier pass transposed four Beeseajay alts and corrupted per-character claims.

Correct recipe outline (full detail in `references/guild-leaderboards.md`):

1. **Enumerate primaries as `characters(type: PRIMARY) { id }` — ids only.** Requesting `name class` too truncates the tool response (~100k char cap) with 1k+ primaries. Bare ids were ~10k chars and complete.
2. **Batch `character(id: X) { attendedCount(from: "2000-01-01", zones: [...], includeFamily: true) }` across many primaries via aliases** — this returns each family's deduped total directly, no manual summing.
3. Rank the results, then verify the top candidates against a tab/log number before presenting.

### When to use GraphQL vs REST vs SQL

A third read path exists alongside GraphQL v2 and REST v1: a read-only raw-SQL tool
connected directly to Postgres. See
`references/db-query.md` for the verified schema and example queries before
using it — table/view names there are confirmed live against the actual
grants, not guessed.

| Question | Use |
|---|---|
| Attendance for a player or their alts | GraphQL `characterFamilies` |
| Single character attendance | GraphQL `character.attendance` |
| Recent raid list | GraphQL `raids` |
| Who can craft/enchant/consume X | GraphQL `recipes`, or SQL (`db-query.md` #4) |
| Guild-wide ranking/leaderboard/aggregate question | **Prefer SQL** (`db-query.md` #3) — a `GROUP BY`/`COUNT(DISTINCT raid_id)` query replaces the multi-call GraphQL sweep this used to require, and the granted `views.primary_raid_attendee_map`/`primary_raid_bench_map` views already dedupe per-family per-raid. Still cross-check against a user-stated tab number before presenting as final — SQL isn't automatically exempt from the veteran-overcount caveat. |
| Ad hoc multi-table join/report that doesn't map cleanly to the GraphQL schema | SQL |
| Raid plan roster / AA slots (read) | REST `/raid-plans/{id}` (no GraphQL equivalent), or SQL (`db-query.md` #5) for a simpler roster-only read |
| Create/update/delete anything | REST (GraphQL v2 and the SQL tool are both read-only) |
| Check a user's role or templarEnabled | REST `/me` |

If a read-only task seems to need REST, double-check the GraphQL schema first — it's usually covered there and batches better.

### Recipe / Crafter Lookups

Use the `recipes` GraphQL query to find who can craft or enchant something. This covers enchants, crafted gear, flasks/potions, food, and other consumables.

**Pattern:**
```graphql
query {
  recipes(profession: ENCHANTING, search: "stats") {
    name
    tags
    crafters(includeInactive: false) {
      character { name class }
    }
  }
}
```

**Parameters:**
- `profession` — enum: `ALCHEMY`, `BLACKSMITHING`, `COOKING`, `ENCHANTING`, `ENGINEERING`, `LEATHERWORKING`, `TAILORING`
- `search` — case-insensitive partial match on recipe name
- `crafters(includeInactive: false)` — returns only active raiders who know the recipe
- Omit `profession` to search across all professions at once

**Common searches:**
- `"stats"` → chest enchants (Greater Stats +4, Stats +3)
- `"spirit"` → spirit enchants (weapon, chest)
- `"intellect"` → intellect enchants
- `"healing"` → healing power enchants
- `"flask"` → flasks (Alchemy)
- `"potion"` → potions (Alchemy)
- `"oil"` → wizard oil / mana oil (Enchanting)
- `"might"` → Mighty Rage Potion, weapon enchants
- `"lionheart"` → Lionheart Helm (Blacksmithing)

### Full "Who's Best to Contact" Workflow

When asked who can provide something AND who's most likely to be online, follow this chain:

```
Step 1 — Search recipe → get crafter names
   recipes(profession: BLACKSMITHING, search: "lionheart") { crafters { character { name class } } }

Step 2 — Check if any crafters are alts (isPrimary: false)
   characters(search: "Bcjhunt", type: ALL) { id name class isPrimary primaryCharacter { name class } }

Step 3 — Get family attendance for primaries to see recent activity
   characterFamilies(primaryCharacterIds: [<id>]) { attendance(from: "2026-04-01") { status raid { date name } } }

Step 4 — Rank by most recent attendance. Prefer characters seen in the last ~3 raid days.
```

**GraphQL gotcha — aliases required for parallel queries.** When looking up multiple characters at once, you must use unique aliases:
```graphql
query {
  bcjhunt: characters(search: "Bcjhunt") { id name isPrimary primaryCharacter { name } }
  pulling: characters(search: "Pulling") { id name isPrimary primaryCharacter { name } }
}
```

### Pitfalls — GraphQL

- **Don't assume data isn't available.** Before telling a user you can't answer a question, check the schema (the SDL) first. The schema evolves and may already cover what looks like REST-only or unavailable data.
- **...except combat-log content, which is definitively absent.** The WCL import stores only *who appeared in the log* and *which bosses died*. There is no death, damage, healing, DPS, or per-encounter data in either API — confirmed against the live SDL (`RaidLog` = id/name/zone/startTime/endTime/kills/killCount/attendees) and the granted DB tables. "Who died the most in Tuesday Naxx this month?" is **not answerable**, and it is not a memory or horizon problem — say so in one step, don't hunt or hedge, then offer what is answerable (attendance, bench, boss kill list, dates) and note that death detail lives in WCL itself, which this agent doesn't fetch from. Full detail: `references/db-query.md` §9.
- **Don't guess a recipe name — search first.** A user saying "+4 stats" could mean chest enchant (Greater Stats +4), not ZG shoulder enchants. Always search the recipes table rather than guessing.
- **Crafters may be alts.** Bcjhunt (Hunter) may be an alt of Beeseajay (Mage); Pulling (Warrior) may be an alt of Slackinof (Warlock). Resolve via `primaryCharacter` before recommending who to contact.
- **Recipe query with all crafters can timeout** if there are many. Always include a `search` filter to narrow results.
- **Raid log kill data is unreliable.** The `kills`/`killCount` fields on `raids.logs` only reflect partially-imported WCL data. A full 15/15 clear may show only 3 kills (confirmed: raid 593, log h9G3pVyDwRcgL62q). Never use these fields to conclude a boss wasn't killed. `characterStatus`/`familyStatus` attendance data is reliable; kill counts are not. If a raid looks under-imported, REST `POST /raids/{id}/refresh-logs` can fix it (see REST section). Full audit + cost rules: `references/raid-log-audit.md`.
- **`kills` is NOT zone-scoped.** A log attached to a Naxx raid can contain another zone's bosses — raids 63 and 42 (Oct/Nov 2024) show 18 and 22 "kills" because those nights ran Naxxramas *and* AQ40. Always filter the kill names to the target zone's boss list before computing a clear, and never quote a raw `killCount` from a mixed-zone night.
- **No death/combat data exists — say so, don't hunt.** Temple stores only log attendance plus the boss kill list. There is no death, damage, healing, DPS, or per-encounter data in the DB or the GraphQL schema (verified against both). "Who died the most" is not answerable and is *not* a memory/horizon problem — state it plainly and offer attendance/bench/kills instead. Details: `references/db-query.md` §9.
- **Achievements are readable — GraphQL first.** `Character.achievements` and `CharacterFamily.achievements` return what a family has earned (name, description resolved for the highest tier, scope, season, `highestTier`, every tier with `awardedAt` and `source`). They are awarded to the *primary*, so asking about an alt returns its primary's — say so. Earned only: a hidden achievement appears once earned, and **never volunteer or hint at a hidden achievement someone has not earned.** SQL can read the raw tables too (`references/db-query.md` §10). Guild-wide questions ("who has X", "how many have Y") are a SQL job; per-player questions are GraphQL. There is no REST read route for achievements.
- **`information_schema` hides ungranted relations — enumerate with `pg_catalog`.** A table missing from `information_schema.tables` is not proof it doesn't exist (that view shows only granted objects). Before telling anyone Temple "doesn't store X", check `pg_catalog.pg_class` — see `references/db-query.md` §9.
- **`refresh-logs` is per-raid with no batch endpoint.** Count the suspects and project the runtime (`raids × ~4-10s`) before firing — a guild-wide sweep is 6-15 minutes. When a raid lead states a time budget, honour it literally: if over, report the count + list + projection and offer a smaller window instead of starting. Name the raids before firing, since it's a write. Fired in parallel blocks of ~10, a 52-raid batch completed cleanly (52/52, zero failures) — the hard part is the count-then-report sequence, not the raw size. Works for any zone, not just Naxx: see `references/raid-log-audit.md` and `templates/zone-clear-audit.sql`.
- **`isIgnored = true` → 0% attendance.** A character with `isIgnored: true` shows `attendancePct: 0`/`weeksTracked: 0` in aggregations even if they've attended plenty of raids — the aggregation intentionally skips ignored characters. Always check for `isIgnored` before interpreting 0% as absence.
- **Absence ≠ ghosting.** Someone may have been absent from a logged raid because they weren't signed up. To confirm ghosting, cross-reference a past plan roster (REST) against attendance records for the same dates. A signup who was in the plan but absent from the log is a proven ghoster.

---

## REST v1 API — use only when GraphQL can't do it

**Base:** `https://www.temple-era.com/api/v1`
**All endpoints except** `GET /openapi.json` require Bearer auth. Raid Planning + Raid Template endpoints also require `isRaidManager`.

Reach for REST for: mutations (create/update/delete plans, raids, templates, roster/AA patches, the Templar toggle), and the few read paths with no GraphQL equivalent (raid plan roster detail, `/me`). **Avoid iterating REST v1 calls** (e.g. paging through `/characters` or hitting `/characters/{id}/attendance` per-character in a loop) — if the task is "for each X, get Y," check whether GraphQL's alias-batching covers it first; it usually does and is far cheaper.

**Not listed below?** The tables here are a working summary, not the authority. `GET /endpoints?q=...` is the current route list and `GET /endpoints/spec?tag=<Tag>` has exact request/response schemas for one tag — check them before saying an endpoint doesn't exist (see *Finding out what exists* above).

### Endpoints

#### Meta

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/openapi.json` | ❌ | Full OpenAPI 3.0 spec — ~150 KB, too big for the tool response cap; use `/endpoints` instead |
| GET | `/endpoints` | ❌ | Searchable route index (`?q=`, `?tag=`, `?method=`) |
| GET | `/endpoints/spec` | ❌ | OpenAPI slice for one tag (`?tag=`) |
| GET | `/capabilities` | ✅ | What Temple stores, which surfaces can read it, and what this user may write |

#### User

| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | User profile — `id`, `name`, `isRaidManager`, `isAdmin`, `templarEnabled`, `character` |
| PATCH | `/me/templar` | Toggle Templar access. Body: `{templarEnabled: bool}`. RM only. |

#### Characters

| Method | Path | Description |
|--------|------|-------------|
| GET | `/characters` | List guild characters (max 200). `?q=` name search, `?type=all\|primary\|secondary` |
| GET | `/characters/by-name` | Bulk name lookup. `?names=Cowch,Sneakers` (comma-sep, max 100). Case/diacritic-insensitive. Silent omit unmatched. |
| GET | `/characters/{id}` | Character detail + secondaries + isIgnored |
| GET | `/characters/{id}/attendance` | 6-week rolling attendance (secondary→primary auto-resolved). Response now includes `isIgnored` field — check this before assuming 0% means the player didn't show up. |
| PUT | `/characters/{id}/secondaries` | Set secondaries. Body: `{secondaryIds:[...], mode:"replace"\|"append"}` |
| DELETE | `/characters/{id}/primary` | Unlink secondary from primary |

#### Scheduled Raids (all require isRaidManager)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scheduled-raids` | Upcoming Raid Helper events. Returns `displayTitle`, `startTime`, `signUpCount`, `roleCounts` (Tank/Healer/Melee/Ranged), `existingPlan` (nullable — `{id, lastModifiedAt}` if a plan exists) |
| GET | `/scheduled-raids/{eventId}/signups` | Signups for an event with server-side character matching. `matchStatus`: `matched` · `ambiguous` · `unmatched` · `skipped`. `character` is null for ambiguous/unmatched. |

#### Raid Planning (all require isRaidManager)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/raid-plans` | List recent plans (thin). `?limit=N` (1-50, default 20) |
| POST | `/raid-plans` | Create plan. Body: `CreatePlan` |
| GET | `/raid-plans/{id}` | Plan detail. **Always use `?include=`** — see section below |
| PATCH | `/raid-plans/{id}` | Update AA template. Body: `{defaultAATemplate, useDefaultAA}` |
| DELETE | `/raid-plans/{id}` | Delete plan permanently |
| POST | `/raid-plans/{id}/sync-signups` | Sync signups. Body: `SyncSignups` |
| PUT | `/raid-plans/{id}/roster` | Bulk patch roster positions. Body: `RosterPatch` |
| PATCH | `/raid-plans/{id}/roster/{planCharacterId}` | Re-link roster slot to a character. Body: `{characterId: int}` |
| PUT | `/raid-plans/{id}/encounters/{encounterId}` | Update encounter settings |
| PUT | `/raid-plans/{id}/encounters/{encounterId}/roster` | Bulk patch per-encounter groups |
| PUT | `/raid-plans/{id}/aa-slots` | Bulk assign AA slots. Body: `AASlotAssignRequest` |

#### Raid Templates (all require isRaidManager)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/raid-templates` | List all zones |
| GET | `/raid-templates/{zoneId}` | Zone detail with encounters + groups |
| PATCH | `/raid-templates/{zoneId}` | Update template (isActive, defaultAATemplate). Auto-creates if missing. |
| POST | `/raid-templates/{zoneId}/encounters` | Add encounter preset |
| PUT | `/raid-templates/{zoneId}/encounters/{encounterId}` | Update encounter preset |
| DELETE | `/raid-templates/{zoneId}/encounters/{encounterId}` | Delete encounter preset |
| POST | `/raid-templates/{zoneId}/encounters/reorder` | Bulk reorder. Body: `{groups:[], encounters:[]}` |
| POST | `/raid-templates/{zoneId}/groups` | Create group. Body: `{groupName}` |
| PUT | `/raid-templates/{zoneId}/groups/{groupId}` | Rename group |
| DELETE | `/raid-templates/{zoneId}/groups/{groupId}` | Delete group. `?mode=promote\|deleteChildren` |

#### Raids

| Method | Path | Description |
|--------|------|-------------|
| GET | `/raids` | List raids. `?zone=Naxxramas` `?from=2026-01-01` `?to=2026-03-01` `?scored=true` `?limit=50` `?offset=0` — prefer GraphQL `raids` for read-only listing; use this REST form mainly alongside writes. |
| POST | `/raids` | Create raid. Body: `CreateRaid` (`name`, `date`, `zone`, `attendanceWeight?`, `raidLogIds?`, `bench?`) |
| GET | `/raids/{id}` | Raid detail. `?include=` for optional sections. Returns creator, logs, characters with attendance. |
| PATCH | `/raids/{id}` | Update raid (name, date, zone, attendanceWeight, raidLogIds) |
| DELETE | `/raids/{id}` | Delete raid permanently |
| PUT | `/raids/{id}/bench` | Set bench. Body: `{characterIds: [int]}` |
| POST | `/raids/{id}/refresh-logs` | Re-sync WCL logs for the raid. Returns `{refreshed: [string]}` — array of log IDs. |

#### Achievements, world buffs, SoftRes (write routes)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/achievements` | Create a custom (manual-grant) achievement — always hidden, one tier. `achievement:manage` |
| POST | `/achievements/{id}/grant` | Grant a custom achievement to a family. `achievement:manage` |
| GET | `/world-buffs/status` · `/world-buffs/assignments` | World-buff turn-in status / scheduled turn-ins (`?state=past` needs `worldbuff:manage`) |
| POST · PATCH · DELETE | `/world-buffs/status`, `/world-buffs/assignments` … | Submit / update / remove turn-ins. `worldbuff:manage` |
| POST | `/softres` | Create an SR (see *SoftRes* below). `softres:access` |

### `?include=` — Raid Plan Section Filtering

**Always pass `?include=` via `params=`** to keep the response manageable. Omitting it also returns everything, but explicit include is better practice.

**Valid sections:** `characters`, `encounterGroups`, `encounters`, `encounterAssignments`, `aaSlots`

**`encounterAssignments` and `aaSlots` auto-include `encounters`** — no need to list it explicitly.

**Metadata always returned** (never needs requesting): `id`, `name`, `planUrl`, `zoneId`, `startAt`, `lastModifiedAt`, `defaultAATemplate`, `useDefaultAA`, `availableSlots`, `raidHelperEventId`, `isPublic`

⚠️ **`include` is additive, not exclusive.** Even with `include=characters`, the API still returns ALL sections (encounterGroups, encounters, encounterAssignments, aaSlots). The parameter ensures named sections are present but does NOT suppress unlisted sections. Plan responses on the wire always contain the full plan payload.

| Goal | `params=` value |
|------|----------------|
| Who's in the plan | `include=characters` |
| AA assignments only | `include=aaSlots` |
| Roster + AA | `include=characters,aaSlots` |
| Roster + per-encounter groups | `include=characters,encounterAssignments` |
| Full assignments | `include=characters,encounterAssignments,aaSlots` |
| Encounter group editing | *(omit `?include=` — need full detail)* |

### Request Bodies

- **CreatePlan:** `{raidHelperEventId, name(max256), zoneId(max64), startAt(ISO?nullable), cloneFromPlanId(uuid?nullable)}`
- **CreateRaid:** `{name(1-256), date(ISO), zone, attendanceWeight?(num), raidLogIds?([string]), bench?([int])}`
- **SyncSignups:** `{mode: "addNewSignupsToBench"\|"fullReimport"}`
- **RosterPatch:** `[{planCharacterId(uuid), group(0-7/nullable), position(0-4/nullable)}]`
- **AASlotAssignRequest:** `[{slotName(max128), planCharacterId(uuid), encounterId(uuid?nullable=plan-level)}]`
- **FamilyUpdate:** `{secondaryIds:[int], mode:"replace"\|"append"}`

### Example calls (paths are relative to `/api/v1`)

```
GET /scheduled-raids
GET /scheduled-raids/{eventId}/signups
GET /raid-plans/{id}?include=characters,aaSlots
POST /raid-plans   body: {"name":"MC Tue","zoneId":"mc","raidHelperEventId":"123"}
GET /raids?zone=Naxxramas&limit=10
POST /raids   body: {"name":"Naxx 01/20","date":"2026-01-20","zone":"Naxxramas"}
POST /raids/{id}/refresh-logs
```

**Proxy error codes:**

| Code | Meaning | Action |
|------|---------|--------|
| 401 | Bad admin key | The team needs to fix the bot token |
| 403 | Templar access disabled | User toggles on at temple-era.com/profile (RM/Admin only) |
| 404 | Discord user not found | User hasn't linked Discord on temple-era.com |
| 409 | No encrypted token | User regenerates API token on profile page |

**Raid plan URL format:** `https://www.temple-era.com/raid-manager/raid-planner/{planId}`

### User Onboarding

1. Go to **https://www.temple-era.com/profile** and **regenerate API token**.
2. Toggle **Templar access** on (Raid Managers/Admins only).
3. Verify: `GET /me` — check `templarEnabled: true`.

### Pitfalls & Gotchas — REST

- **`GET /characters?limit=200` only covers the first 200 alphabetically.** Larger guilds may have more than 200 characters; entries after the 200th (especially late-alphabet names like S, T, W) are silently omitted. Use `?q=` name-substring searches for targeted coverage, or better, use GraphQL `characters(search: "Name")` directly. See `references/talent-scouting.md` for exhaustive enumeration strategy.
- **`?include=` is critical** — always use it on `GET /raid-plans/{id}`, otherwise you get the full payload.
- **409 on create plan** — Plan already exists for this event. Check `existingPlan` in the events response.
- **502 on scheduled-raids or signups** — Raid Helper unavailable. Retry later.
- **AA slot `encounterId`: null** = plan-level default; **uuid** = encounter-specific.
- **`addNewSignupsToBench`** is safe (never removes). **`fullReimport`** replaces everything and resets encounter groups.
- **RosterPatch:** Characters not listed = untouched. IDs not in the plan = silently skipped.
- **FamilyUpdate `replace`** clears existing secondaries. `append` merges (deduped).
- **Attendance** auto-resolves secondary → primary.
- **Zone template** auto-creates on PATCH or POST if record doesn't exist.
- **Delete group modes:** `promote` (default) moves children to top-level. `deleteChildren` removes them.
- **Clone doesn't carry roster/AA** — cloned plans lose all `defaultGroup`/`defaultPosition`, `encounterAssignments`, and `aaSlotAssignments`. Re-sync signups, re-set groups, re-assign AA slots after cloning.
- **Raid group display:** Show as **1-based** (Group 1–8) in messages. API uses 0-based internally.
- **Timestamps:** API returns UTC. Convert to **America/New_York** before displaying.
- **Large plan responses truncate (>200k chars).** Plans with populated encounterAssignments + AA slot assignments + per-encounter aaTemplates can exceed the tool's response limit. To read just the character roster: PATCH `defaultAATemplate` to a short string, then GET with `include=characters`, then PATCH the template back. (Per-encounter aaTemplates may still cause truncation — clear those via PUT `/raid-plans/{id}/encounters/{encounterId}` with `{"aaTemplate":null}` if needed.)
- **Don't read the OpenAPI spec whole, and don't claim an endpoint is absent because it isn't in this skill or because a probe 404'd.** `GET /openapi.json` is ~150 KB and exceeds the tool response cap. Use `GET /endpoints?q=...` and `GET /endpoints/spec?tag=...` (or `GET /capabilities` for a whole data domain). Never claim a data domain doesn't exist without checking `/capabilities` and, for SQL, `pg_catalog` (see db-query.md §9).
- **Character family lookup for alt cross-referencing.** GET /characters/{id} returns secondaryCharacters[] and primaryCharacterName - useful when matching Discord signup names to attendees across alts. A signup like Chronic/Vxder means the player has multiple characters; check if any of their alts were in the raid.
- **Signup class != attendance class.** A player signing as Paladin named Waffle may have attended on their Shaman alt Wawful. The class label reflects role flexibility, not the character they will bring. Always check the character family system.
- **Discord signup names use alt-pair format.** Names like Chronic/Vxder, Gator/Milkers-Ashkandi, Mzzy,Parsley use main/alt or alt1,alt2 formats. Check ALL name segments against the DB.
- **bench counts as did not attend for roster priority**, but counts as present for consecutive-week streaks.
- **Signup visibility without a plan.** Use `GET /scheduled-raids/{eventId}/signups` — no raid plan required. Character matching and attendance are inlined server-side. To answer "who signed up for tonight?", get the event ID from `GET /scheduled-raids` and call the signups endpoint directly.
- **`POST /raids/{id}/refresh-logs` fixes incomplete imports.** If a raid shows fewer bosses than expected and you suspect bad data, call this endpoint to re-sync from WCL. It returns `{refreshed: [\"logId\"]}`. After refresh, re-query the data. In testing, 5 of 9 suspect 2026 Naxx raids were fixed this way. For a full audit workflow, see `references/raid-log-audit.md`.
- **No API for site/dashboard links or guild settings.** There is no REST or GraphQL endpoint to read/update dashboard links (e.g. the "Raid Loot Policy" URL) — `/guild`, `/settings` and `/guild-settings` are all 404, the GraphQL schema has no settings query, and `/me` carries no such fields. The dashboard is client-rendered, so such links can't be verified or fixed through the API. Say so plainly and pass the request to the team with the exact target URL.

---

## SoftRes (SR)

**Create:** `POST /softres` (REST v1, via proxy) now exists. Required body field: `zone`, one of
`onyxia` | `mc` | `bwl` | `zg` | `aq20` | `aq40` | `naxxramas`. This is what backs the `/sr` slash command.
It is a **public write** — it creates the softres.it raid, posts the green "SRs : ..." message in the
channel, and adds the admin link to the SoftRes Token thread. Confirm with the raid lead (and get the
zone) before firing; never fire it as a probe. Response/extra fields not yet documented — validation
errors only ever reported the `zone` issue.

**Read:** none. `GET /softres`, `GET /softres/scans`, `GET /softres/links` all return the HTML 404 shell.
There is no way to list, fetch, or scan an SR, and no way to read an admin token from here. Point users at
temple-era.com/softres and the Token thread instead.

**Route existence:** ask `GET /endpoints?q=softres` rather than probing. Only as a last resort, and labelled as inference: an *unknown* path under `/api/v1` returns the HTML 404 shell (`<!DOCTYPE html>` … "The page you are looking for cannot be found."), a *registered* one returns JSON (a 400/422 validation error), and a 405 means the route exists but not for that method. Never fire a write as a probe.

## MRT (Method Raid Tools) roster strings

MRT strings can be decoded and encoded (an agent may have dedicated tools for it). Facts worth knowing:

- **Decode** turns a pasted `MRTRGR…` string into who is in which slot. **Encode** exports a roster back into a string to paste into the addon. When a plan exists, prefer `GET /raid-plans/{id}?include=characters` over decoding.
- **Slot numbering:** 1-based, row-major — group 1 = slots 1–5, group 2 = 6–10, … group 8 = 36–40. The API's `defaultGroup`/`defaultPosition` are 0-based; convert.
- **Names from a plan** match the web UI: a known character on the home server is `Name`, on another server `Name-Server`, a placeholder `Name?`.
- **Format:** header `MRTRGR`/`EXRTRGR` + flag (`0` raw, `1` deflateRaw) + LibDeflate 6-bit encoding (alphabet a–z A–Z 0–9 `()`, 3 bytes → 4 chars); the payload is a Lua table `0,{[1]="Name1",[2]="Name2",...}`.

## Attendance Troubleshooting

For step-by-step debugging of 0% or unexpected attendance values (checking `isIgnored`, comparing REST vs GraphQL, cross-referencing with family activity):
`references/attendance-troubleshooting.md`

## Raid Composition Reference

For group-building strategy (assigning tanks, spreading healers, Windfury totems, AA slots for BWL/MC):
`references/raid-composition.md`

## Roster Comparison: Signups vs Last Raid

For the "who signed up who wasn't at the last raid" workflow (cross-referencing signups with previous raid attendance, resolving alt/family links, calculating consecutive weekly streaks):
`references/roster-comparison.md`

## Raid Schedule Audit

For the "check every raid week has the right raids" workflow (querying all raids via GraphQL, grouping by Tue-Mon weeks, checking day+zone requirements, reporting gaps):
`references/raid-schedule-audit.md`

## Ghost Risk Analysis

For the "who signed up is most likely to ghost" workflow (identifying no-show patterns from RSVP status, attendance history, and cross-referencing past plan rosters against logged raids):
`references/ghost-risk-analysis.md`

## Raid Log Audit

For the full workflow to audit WCL import completeness — Naxxramas lockout weeks, or any 40-man zone's per-raid clear depth (AQ40/BWL/MC) — refreshing suspect raids via POST /raids/{id}/refresh-logs and recalculating clear stats:
`references/raid-log-audit.md`
Ready-to-run SQL for the per-zone sweep (zone boss lists, under-max list, counts-only projection variant, post-refresh re-check): `templates/zone-clear-audit.sql`

## Talent Scouting — New/Upcoming Raider Identification

For the workflow to find players of a specific class/spec who are newly active (7+ raids recently, less than a year of tenure):
`references/talent-scouting.md`