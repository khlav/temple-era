# Roster Comparison: Signups vs Previous Raid Attendance

Workflow for answering: "who signed up for this raid who did not attend the last one?"

## Data Sources

| Source | What It Tells You | Access Pattern |
|--------|-------------------|----------------|
| **Scheduled Raids** (`/scheduled-raids`) | Upcoming events with `displayTitle`, `signUpCount`, `roleCounts`, and `existingPlan` annotation | Find tonight's event ID |
| **Event Signups** (`/scheduled-raids/{eventId}/signups`) | All signups with server-side character matching, confidence scores, and inlined 6-week attendance | Primary source — replaces the old create-plan-then-sync workflow |
| **Raid Plan** (`/raid-plans/{id}?include=characters`) | Who is placed in the plan roster; `defaultGroup: null` = bench | "Who attended" source for the previous raid |

## Process: "Who signed up who wasn't at the last raid?"

### Step 1 — Get tonight's signups (no plan needed)

```
GET /scheduled-raids              → find the event, note its id
GET /scheduled-raids/{eventId}/signups  → all signups with matching + attendance inlined
```

Each signup includes:
- `discordName`, `className`, `roleName`, `status` (Confirmed/Bench/Tentative/etc.)
- `matchStatus`: `matched` | `ambiguous` | `unmatched` | `skipped`
- `matchConfidence`: 0–1 float
- `character`: `{id, name, class, primaryCharacterId}` — null if ambiguous/unmatched

**matchStatus guide:**
- `matched` — confidently linked to a DB character; use `character` directly
- `ambiguous` — best-guess family found but exact character uncertain; `character.id` may be null
- `unmatched` — no DB match found; manual resolution needed
- `skipped` — non-WoW signup (Bench/Absent class labels, etc.); ignore for roster purposes

### Step 2 — Get last week's attendees

```
GET /raid-plans/{lastPlanId}?include=characters
```

**Characters with `defaultGroup: not null`** = attended (placed in a raid group)
**Characters with `defaultGroup: null`** = bench/did not attend

If the plan response truncates (>200k chars):
1. `PATCH /raid-plans/{lastPlanId}` → `{"defaultAATemplate":"x","useDefaultAA":false}`
2. `GET /raid-plans/{lastPlanId}?include=characters`
3. `PATCH /raid-plans/{lastPlanId}` → restore original template

### Step 3 — Cross-reference

For each `matched` signup, check if `character.primaryCharacterId` (or `character.id` if already primary) was in last week's attendee set. Any family member attending = the human attended.

For `ambiguous` signups, use `GET /characters?q=<name>` to resolve manually if needed.

For `unmatched` signups, check all name segments (alt-pair formats below) against the DB.

### Step 4 — Handle Discord naming conventions

Raid Helper signup names often use formats like:
- `"Chronic/Vxder"` — player known as Chronic, also plays Vxder
- `"Gator/Milkers-Ashkandi"` — Gator and Milkers (on Ashkandi)
- `"Mzzy,Parsley"` — Mzzy and Parsley
- `"Waffle" (Paladin class)` — flexible player; class ≠ character they'll attend on

The signups endpoint handles these for `matched`/`ambiguous` results. Only apply manual parsing for `unmatched` signups.

### Step 5 — Determine streak for consecutive weekly attendance

From the inlined attendance in the signups response, or via `GET /characters/{id}/attendance` for deeper history. Both `ATTENDED` and `BENCH` count as present for streak; `ABSENT` = missed.

### Step 6 — Per-class attendance analysis

When asked for class-specific roster reports (e.g. "mages with Naxx streaks"):

1. Identify signups whose character is that class, or whose family has an alt of that class
2. For each human, check how many tracked raids they attended on that specific class alt
3. Report: **Streak** (consecutive recent raids) and **X/N** (total attended out of tracked period)

## Formatting

Plain-text tables with `Player`, `Streak`, and `X/N` columns. No per-week symbol grids — user finds those harder to read.

## Common Pitfalls

- **No plan required for signups.** `GET /scheduled-raids/{eventId}/signups` works without an existing raid plan.
- **`include=` is additive, not exclusive.** Even `include=characters` returns all sections of a plan.
- **No REST API for `/raids/{id}`.** Individual raid records are client-side Next.js pages. Use plan data or per-character attendance instead.
- **Attendance records ≠ raid plans.** `/characters/{id}/attendance` tracks WCL-logged raids, not temple-era plans. Some raids may not appear even if they ran.
- **bench counts as "did not attend" for roster priority**, but counts as "present" for streaks.
- **Signup class ≠ attendance class.** A "Paladin" signup named Waffle may have attended on their Shaman alt Wawful. Always verify via family links.
