# Direct SQL access (read-only)

A third data-access path alongside GraphQL v2 and REST v1: a single read-only
tool that runs a raw SQL `SELECT` directly against
Temple's Postgres database. Use it for ad hoc aggregation/reporting questions
that are awkward via the API — guild-wide rankings, multi-table joins,
anything that would otherwise mean batching dozens of GraphQL calls.

Everything below was verified live against the actual `templar` role
(Aug 2026) — table/column/view names, permitted joins, and example query
results are all real, not guessed from the GraphQL schema. If the live
schema ever drifts from this doc, trust the DB error over this file and
update it.

## Connects as `templar`, scoped to `reports_readonly`

`reports_readonly` is a NOLOGIN privilege role holding the actual `SELECT`
grants; `templar` is a LOGIN role that is a member of it, so connecting as
`templar` inherits those grants. **Only the tables/views below are granted —
nothing else is queryable, confirmed by testing writes and by testing joins
to ungranted tables (see Guardrails and Gotchas).**

## Guardrails (enforced in code, not just prompted)

- **Only `SELECT` / `WITH ... SELECT` is accepted.** Anything else is
  rejected before it reaches the database (`ValueError` from the tool, not a
  DB round-trip). The role has no write grants either way — confirmed: an
  `UPDATE` against `character` returns `permission denied for table
  character` — but the tool rejects non-SELECT statements itself first.
- **Single statement only.** A second `;`-delimited statement is rejected.
- **Results are capped at 200 rows**, enforced by the tool wrapping your
  query (`SELECT * FROM (<your query>) AS _sub LIMIT 201`), not by trusting
  a `LIMIT` you write. Check `truncated` in the response — if true, narrow
  the query (add filters, aggregate) rather than assuming you saw everything.
- **30s statement timeout**, enforced both server-side (by the role) and
  client-side (set again by the tool as a second layer).

## ⚠️ Gotcha: `created_by`/`updated_by` → `auth_user` is NOT joinable

Most tables have `created_by`/`updated_by` (uuid, FK to `auth_user.id`).
`auth_user` is **not granted** to `reports_readonly`. Confirmed directly:

```sql
select r.raid_id, u.email from public.raid r join auth_user u on u.id = r.created_by limit 1;
-- ERROR:  permission denied for table auth_user
```

Never join out to `auth_user` to resolve who created/updated something —
there's no way to answer that from this connection. If asked, say so rather
than retrying the join.

## Conceptual model: `raid` and `character` are the entities. `raid_log`/`raid_log_attendee_map` are plumbing.

The things a question is actually about are always **raids** and **characters** (and character *families* — primary + alts). `raid_log`/`raid_log_attendee_map` exist only to map characters to raids from WCL import data — a single raid can have more than one log (e.g. a reconnect/re-import), so **always dedupe/count by `raid.raid_id`, never by `raid_log_id`.** Counting distinct `raid_log_id` is a real bug, not just a style preference — it can overcount a raid that has multiple logs. Verified no difference in practice for a spot-checked case (raid-first and log-first joins both gave the same count when correctly deduped by `raid_id`), but don't rely on that holding generally — always group/count at the `raid_id` level explicitly.

## Schema — granted tables (schema `public`)

| Table | Purpose | Key columns |
|---|---|---|
| `character` | Every character (mains + alts) | `character_id` (PK), `name`, `class`, `server`, `slug`, `primary_character_id` (FK → `character.character_id`, **null on primaries**), `is_primary` (generated: `character_id = COALESCE(primary_character_id, 0) OR primary_character_id IS NULL`), `is_ignored` |
| `raid` | A scheduled/logged raid night | `raid_id` (PK), `name`, `date`, `zone`, `attendance_weight` |
| `raid_log` | A WCL log tied to a raid (a raid can have >1 log) | `raid_log_id` (PK), `raid_id` (FK), `zone`, `kills` (text[]), `killCount` (generated from `kills`), `start_time_utc`, `end_time_utc` |
| `raid_log_attendee_map` | Who appears in a WCL log (**this is the log-based "attended" ground truth** — matches the character tab, unlike GraphQL's roster-based `attendedCount`) | `raid_log_id` (FK), `character_id` (FK) |
| `raid_bench_map` | Who was benched for a raid (roster-side, not log-based) | `raid_id` (FK), `character_id` (FK) |
| `raid_plan` | A raid-planner plan (roster/AA tool, distinct from `raid`) | `id` (PK, uuid), `event_id` (FK → `raid.raid_id`, nullable), `zone_id`, `name`, `raid_helper_event_id`, `start_at`, `is_public` |
| `raid_plan_character` | A roster slot in a plan | `id` (PK, uuid), `raid_plan_id` (FK), `character_id` (FK, nullable — null = write-in placeholder), `character_name`, `default_group`, `default_position` |
| `raid_plan_encounter` / `raid_plan_encounter_group` | Per-encounter settings / group structure for a plan | `raid_plan_id` (FK) |
| `raid_plan_encounter_assignment` | AA/encounter roster assignment | `encounter_id` (FK), `plan_character_id` (FK → `raid_plan_character.id`), `group_number`, `position` |
| `raid_plan_encounter_aa_slot` | Named AA slot assignment | `plan_character_id` (FK), `slot_name` |
| `raid_plan_encounter_note` | Encounter notes | `encounter_id` (FK), `text` |
| `raid_plan_template` / `raid_plan_template_encounter` / `raid_plan_template_encounter_group` | Per-zone default templates (not a specific plan) | `zone_id` |
| `recipes` | Craftable/enchant recipes | `recipe_spell_id` (PK), `item_id`, `profession` (enum: `Alchemy`, `Blacksmithing`, `Cooking`, `Enchanting`, `Engineering`, `Leatherworking`, `Tailoring` — **note: title case, not GraphQL's ALL_CAPS**), `recipe` (name, text), `tags` (text[]) |
| `character_spells` | Which characters know which recipes | `character_id` (FK), `recipe_spell_id` (FK) |
| `achievement` / `achievement_tier` / `achievement_award` / `season` | Achievements, their tiers, who earned which tier, and seasons (see §10) | `achievement_award.primary_character_id` (FK → `character`, the family's primary) |

**`raid.zone` values** (confirmed distinct, exact strings — note apostrophes need escaping/dollar-quoting): `Molten Core`, `Blackwing Lair`, `Temple of Ahn'Qiraj`, `Naxxramas` (the 4 40-man zones), plus `Ruins of Ahn'Qiraj` (AQ20), `Zul'Gurub`, `Onyxia` (the 20-man/other raids) — matches the "ask the user 40-man-only vs. include 20-man" rule in `guild-leaderboards.md`.

## Schema — granted views (schema `views`, not `public` — qualify explicitly)

These are purpose-built and solve the family-dedup problem that caused the
whole GraphQL `attendedCount`/`includeFamily` saga directly — no manual
summing needed:

| View | Purpose | Columns |
|---|---|---|
| `views.primary_raid_attendee_map` | One row per (raid, family) that attended — **already deduped to the primary character**, with the actual attending alt(s) listed | `raid_id`, `primary_character_id`, `attending_character_ids` (int[]) |
| `views.primary_raid_bench_map` | Same, for bench | `raid_id`, `primary_character_id`, `bench_character_ids` (int[]) |
| `views.primary_raid_attendance_l6lockoutwk` | Rolling last-6-lockout-week attendance %, per primary character (mirrors REST `/characters/{id}/attendance`'s window) | `character_id`, `name`, `weighted_attendance`, `weighted_raid_total`, `weighted_attendance_pct` |
| `views.primary_raid_attendee_and_bench_map` | Attendee + bench union, one row per (raid, family) — the dedup either/or in a single view | `raid_id`, `primary_character_id`, `attending_character_ids`, `bench_character_ids` |
| `views.tracked_raids_l6lockoutwk` | Raids within the current 6-lockout-week window | same columns as `raid`, plus `lockout_week` |
| `views.tracked_raids_current_lockout` | Raids in the current lockout week, tracked only | same columns as `raid` |
| `views.all_raids_current_lockout` | Raids in the current lockout week only | same columns as `raid` |
| `views.report_dates` | The current report window bounds | `report_period_start`, `report_period_end` |

`views.primary_raid_attendee_map`/`primary_raid_bench_map` are built on `raid_log_attendee_map` (log-based).

⚠️ **"Credit" is a raid-level concept, not a per-attendee one — `raid.attendance_weight`.** Confirmed values in use: `0` (199 raids), `0.5` (148 raids), `1` (468 raids). Terminology:
- **"All raids"** → no credit filtering, count everything regardless of `attendance_weight`.
- **"All tracked raids"** → filter to `attendance_weight > 0` (excludes the 199 zero-weight raids — these presumably don't count toward attendance stats, e.g. cancelled/non-standard nights).
Ask which the user means if it's ambiguous, same as the 40-man-vs-all-zones question.

✅ **RESOLVED — the Ramson "gap" was a scope mismatch, not a data problem.** The historical "Ramson = 127" reference (see the "verified exact against the tab" note above) was long mislabeled as *Ramson-the-character-alone* — it's actually the **family** total (Ramson+alts, deduped, attended+bench). Confirmed exactly:
```sql
select count(distinct raid_id) as family_total from (
  select pram.raid_id from views.primary_raid_attendee_map pram
    join public.raid r on r.raid_id = pram.raid_id
    where pram.primary_character_id = 51570634
      and r.zone in ('Molten Core','Blackwing Lair',E'Temple of Ahn''Qiraj','Naxxramas')
  union
  select prbm.raid_id from views.primary_raid_bench_map prbm
    join public.raid r on r.raid_id = prbm.raid_id
    where prbm.primary_character_id = 51570634
      and r.zone in ('Molten Core','Blackwing Lair',E'Temple of Ahn''Qiraj','Naxxramas')
) x;
-- → 127, exact match
```
Ramson-the-character-alone in the same 4 zones is 80 (attended) / 84 (+bench) — a genuinely different, smaller number, not a bug. **Lesson: always be explicit about single-character vs. family scope when quoting or comparing a "tab number"** — a bare name + number from a human tab-read is ambiguous between the two, and that ambiguity is what caused this whole investigation, not a data-completeness issue in the granted tables/views. The SQL path (this tool) is trustworthy for both scopes as long as the scope itself is stated correctly.

✅ **"All zones, attended+bench, no credit filter" is also independently confirmed correct** — user-verified (Aug 2026): Ramson alone = 94, Ramson+alts deduped = 154, via:
```sql
-- single character, all zones, attended OR benched
select count(distinct raid_id) as total from (
  select rl.raid_id from public.raid_log_attendee_map rlam
    join public.character c on c.character_id = rlam.character_id
    join public.raid_log rl on rl.raid_log_id = rlam.raid_log_id
    where c.name = 'Ramson'
  union
  select rbm.raid_id from public.raid_bench_map rbm
    join public.character c on c.character_id = rbm.character_id
    where c.name = 'Ramson'
) x;

-- family (primary_character_id), all zones, attended OR benched, deduped
select count(distinct raid_id) as total from (
  select raid_id from views.primary_raid_attendee_map where primary_character_id = <id>
  union
  select raid_id from views.primary_raid_bench_map where primary_character_id = <id>
) x;
```
So the discrepancy is specifically scoped to the 4-zone/attended-only slice, not a general problem with this data path — the "all zones" query above is trustworthy as-is.

## Verified example queries

### 1. Resolve a character family (mains/primaries + alts)
```sql
select character_id, name, class, is_primary, primary_character_id
from public.character
where coalesce(primary_character_id, character_id) =
      (select coalesce(primary_character_id, character_id) from public.character where name = 'Dunckan');
```
Use exact `name =`, not `ILIKE`, unless you actually need a wildcard/partial match.

### 2. Family total raids attended — the dedup pattern
```sql
select count(distinct raid_id) as raids_attended
from views.primary_raid_attendee_map
where primary_character_id = (select coalesce(primary_character_id, character_id) from public.character where name = 'Dunckan');
```
Verified: Dunckan family → 309 (attended only, all zones, all-time). Add `union` with `primary_raid_bench_map` if bench should count too (mirrors GraphQL's `includeBench: true` default).

### 3. Guild-wide "most raids" leaderboard — the actual question that started this
```sql
select pram.primary_character_id, c.name, count(distinct pram.raid_id) as raids_attended
from views.primary_raid_attendee_map pram
join public.raid r on r.raid_id = pram.raid_id
join public.character c on c.character_id = pram.primary_character_id
where r.zone in ('Molten Core', 'Blackwing Lair', 'Temple of Ahn''Qiraj', 'Naxxramas')
  -- ask the user first: 40-man only (above) vs. include Ruins of Ahn'Qiraj / Zul'Gurub / Onyxia — see guild-leaderboards.md
group by pram.primary_character_id, c.name
order by raids_attended desc
limit 5;
```
Verified live (40-man zones, attended only, all-time): Yagnar 484, Waffle 483, Rogand 478, Whopperjr 430, Cowchpotato 388. **This does not match the GraphQL-derived provisional table in `guild-leaderboards.md`, and per the Ramson cross-check above (SQL 80 vs. tab 127 for the same zones), it should NOT be assumed more accurate just because the query is cleaner** — it may be undercounting for the same unexplained reason. Do not present this list as a final answer without independently verifying at least the top 1-2 names against the character tab first. Note this also omits bench — add the `primary_raid_bench_map` union (per query 2) if the user wants attended+bench like the tab shows.

### 4. Recipe / crafter lookup
```sql
select rcp.recipe_spell_id, rcp.recipe, rcp.tags, c.name as crafter_name, c.class
from public.recipes rcp
join public.character_spells cs on cs.recipe_spell_id = rcp.recipe_spell_id
join public.character c on c.character_id = cs.character_id
where rcp.profession = 'Enchanting' and rcp.recipe ilike '%stats%';
```
Note `profession` values are title case (`'Enchanting'`), not GraphQL's `ENCHANTING`.

### 5. Roster lookup — who's in a specific plan
```sql
select rpc.character_name, rpc.default_group, rpc.default_position
from public.raid_plan_character rpc
where rpc.raid_plan_id = '<plan-uuid>'
order by rpc.default_group, rpc.default_position;
```
`raid_plan.id` is the plan UUID (same one used in the raid-planner URL); look it up via `select id, name from public.raid_plan order by created_at desc limit N` if you don't already have it. `character_id` is nullable here — null means a write-in placeholder, use `character_name` in that case rather than assuming a real character link.

### 6. Tenure span — earliest vs. latest raid on record, active raiders only

```sql
with active as (
  select distinct pram.primary_character_id
  from views.primary_raid_attendee_map pram
  join public.raid r on r.raid_id = pram.raid_id
  where r.date >= current_date - interval '28 days'
)
select c.name as primary_name,
       min(r.date) as earliest_raid,
       max(r.date) as latest_raid,
       (max(r.date) - min(r.date)) as days_span
from views.primary_raid_attendee_map pram
join public.raid r on r.raid_id = pram.raid_id
join public.character c on c.character_id = pram.primary_character_id
where pram.primary_character_id in (select primary_character_id from active)
group by pram.primary_character_id, c.name
order by days_span desc
limit 5;
```

- Verified (Aug 2026): top-5 spans were 767–764 days; earliest dates pinned at the guild's first recorded raid (2024-07-01). A span ranking is effectively a **tenure ranking** — state that when presenting.
- "First seen in year X" variant: add `having min(r.date) >= '2025-01-01' and min(r.date) < '2026-01-01'` (verified: Frostbringer 575d, Beeseajay 572d, Ramdoch 540d, Zulazeelu 531d, Verin 525d).
- Postgres date subtraction `max - min` returns integer days directly.

### 7. ">N raids per month, every month since X" — family- and character-level

```sql
with months as (
  select to_char(generate_series('2025-07-01'::date, current_date, interval '1 month'), 'YYYY-MM') as month
),
per_month as (
  select pram.primary_character_id,
         to_char(r.date, 'YYYY-MM') as month,
         count(distinct r.raid_id) as raids
  from views.primary_raid_attendee_map pram
  join public.raid r on r.raid_id = pram.raid_id
  where r.date >= '2025-07-01'
  group by pram.primary_character_id, to_char(r.date, 'YYYY-MM')
)
select c.name, c.class, count(distinct pm.month) as months_qualified
from per_month pm
join months m on m.month = pm.month
join public.character c on c.character_id = pm.primary_character_id
where pm.raids > 10
group by pm.primary_character_id, c.name, c.class
having count(distinct pm.month) = (select count(*) from months)
order by c.name;
```

Character-level variant: base `per_month` on `public.raid_log_attendee_map` + `public.raid_log` join (character_id) instead of the family view. `>10` is strict — 11+ raids.

⚠️ **The current partial month is the whole ballgame.** "Every month since July 2025" read inclusively (through today, 14 months) vs. complete-months-only (13 months) gave **0 vs. 9 qualifying families** (verified Aug 2026) — nobody clears 11+ raids in the first week of a month. Always compute and present BOTH variants, labeled, rather than picking one.

⚠️ **Character vs. family scope changes the answer materially** (1 vs. 9 qualifiers in the same run — alts keep families above the line). The user said "characters" first, then "and for family?" — offer both when the question is ambiguous. `generate_series` month list naturally fails anyone missing a month (no row → HAVING count ≠ total), including months with zero raids guild-wide.

### 8. Lockout-week completeness audit — "weeks that don't have 15 Naxx bosses"

Used Aug/Sep 2026 for the "identify raid weeks (Tue→Mon) without a full 15-boss Naxx clear, then refresh the short ones" workflow.

**⚠️ The week spine MUST start on a Tuesday.** `generate_series` inherits the start date's day-of-week, so starting it on a Wednesday (e.g. `'2025-01-01'`) produces a Wed→Tue spine that no longer aligns with the Tuesday-based `week_start` computed from `raid.date`. The `left join` then matches **nothing** and every row silently returns `0` — looks exactly like catastrophic data loss, is actually a query bug. Verified live: a `'2025-01-01'` spine returned 89 rows of zeros. Always start the spine on a real Tuesday (`'2024-07-02'`, the guild's first Naxx Tuesday) and filter the output range in the `WHERE`.

```sql
with spine as (
  -- must be a TUESDAY
  select generate_series('2024-07-02'::date, current_date, interval '7 days')::date as week_start
),
naxx_kills as (
  select (r.date - ((extract(dow from r.date)::int + 5) % 7))::date as week_start,
         r.raid_id,
         k as boss
  from public.raid r
  join public.raid_log rl on rl.raid_id = r.raid_id,
       unnest(rl.kills) k
  where r.zone = 'Naxxramas'
    and k in ('Anub''Rekhan','Grand Widow Faerlina','Maexxna','Noth the Plaguebringer',
              'Heigan the Unclean','Loatheb','Instructor Razuvious','Gothik the Harvester',
              'The Four Horsemen','Patchwerk','Grobbulus','Gluth','Thaddius',
              'Sapphiron','Kel''Thuzad')
)
select s.week_start,
       coalesce(count(distinct nk.boss),0) as naxx_bosses,
       coalesce(count(distinct nk.raid_id),0) as naxx_raids,
       coalesce(string_agg(distinct nk.raid_id::text, ',' order by nk.raid_id::text),'-') as naxx_raid_ids
from spine s
left join naxx_kills nk on nk.week_start = s.week_start
where s.week_start >= '2025-01-07'   -- output window; spine stays Tuesday-anchored
group by s.week_start
having coalesce(count(distinct nk.boss),0) <> 15
order by s.week_start;
```

Key points, all verified live (Sep 2026):

- **Filter `kills` to the 15 Naxx boss names.** `raid_log.kills` holds boss names from whatever zone the log covers — raids #63 (10/29/2024) and #42 (11/05/2024) are tagged `zone='Naxxramas'` but carry 18 and 22 kills because the log spans Naxx **and** AQ40. Without the name filter those two wrongly "pass" the 15-boss test.
- **Week ≠ raid.** Cleanup nights land in the same Tue→Mon lockout, so the week view is materially *smaller* than the per-raid view — 70 short raids collapsed to 24 short weeks in the same dataset. Always state which framing you're using.
- **Count `distinct boss`,** not `sum("killCount")` — a boss downed on both Tuesday and a cleanup night must count once.
- **A week at `0` is an absence, not a short clear** (Christmas week 12/24/2024). Report it separately from partial clears.
- Note `"killCount"` must be double-quoted (camelCase column); `rl.killcount` errors with a hint.

**Refresh expectations (from an 18+21-raid run, Sep 2026):** partial *imports* show up as wildly short weeks — 3, 5, 7, 11 bosses — and all of those jumped to exactly 15 after `POST /raids/{id}/refresh-logs`. Weeks reading 13–14 stayed 13–14. So the deep shortfalls are import failures; the 1–2 boss gaps are genuine. 2024 (the guild's first Naxx months) had **zero** corrections out of 11 short weeks — early-progression shortfalls, clean data. Tell the user up front that a refresh confirms as often as it fixes.

### 8b. Lockout-week (Tue→Mon) aggregation — minimal form

```sql
with spine as (
  select generate_series('2024-07-02'::date, current_date, interval '7 days')::date as week_start
),
naxx_kills as (
  select (r.date - ((extract(dow from r.date)::int + 5) % 7))::date as week_start,
         r.raid_id, k as boss
  from public.raid r
  join public.raid_log rl on rl.raid_id = r.raid_id,
       unnest(rl.kills) k
  where r.zone = 'Naxxramas'
    and k in ('Anub''Rekhan','Grand Widow Faerlina','Maexxna','Noth the Plaguebringer',
              'Heigan the Unclean','Loatheb','Instructor Razuvious','Gothik the Harvester',
              'The Four Horsemen','Patchwerk','Grobbulus','Gluth','Thaddius',
              'Sapphiron','Kel''Thuzad')
)
select s.week_start,
       count(distinct nk.boss) as naxx_bosses,
       count(distinct nk.raid_id) as naxx_raids,
       coalesce(string_agg(distinct nk.raid_id::text, ','), '-') as naxx_raid_ids
from spine s
left join naxx_kills nk on nk.week_start = s.week_start
group by s.week_start
having count(distinct nk.boss) <> 15
order by s.week_start;
```

- **Week-start expression:** `date - ((extract(dow from date)::int + 5) % 7)` — Tue(2) → itself, Mon(1) → the previous Tuesday. Corrects to Tue→Mon lockouts, matching WoW resets.
- **`generate_series(..., interval '7 days')`** off a known Tuesday builds the spine; the LEFT JOIN keeps zero-kill weeks visible as `0` rather than missing them from the result.
- ⚠️ **The spine's first date MUST be a Tuesday.** Rebasing the series to an arbitrary date (e.g. `'2025-01-01'`, a Wednesday) makes the spine's weekday drift out of step with the Tue-based `week_start` computed inside the CTE, so the LEFT JOIN matches **nothing and every row returns 0 bosses** — which reads exactly like catastrophic data loss immediately after a batch of refreshes. It isn't data loss, it's the query. **Fix: never rebase the series** — generate the full spine from a known Tuesday and scope with a filter instead: `where s.week_start >= '2025-01-07'` (also a Tuesday). If a result comes back impossibly empty, check the spine's weekday before believing it, and say so plainly if you already reported the bad number.
- `count(distinct boss)` (not a row count) is what makes a boss killed on two nights in one lockout count once.
- Swap the `having` for `= 15` to list the clean weeks, or drop it to get every week.

### 9. What Temple does NOT store — check before promising analysis

Temple's imported WCL data is deliberately narrow. Confirmed against the live DB **and** the live GraphQL SDL:

- `raid_log` → `raid_log_id`, `raid_id`, `zone`, `kills` (text[]), `"killCount"`, `start_time_utc`, `end_time_utc`
- `raid_log_attendee_map` → `raid_log_id`, `character_id` (who appeared — no per-player stats)
- `raid_bench_map` → `raid_id`, `character_id`

**There is no death, damage, healing, DPS, per-encounter, or event-level data anywhere in the schema.** "Who died the most in Naxx this month" is not answerable — and it is not a memory or horizon problem, so don't hunt for it or hedge. Say so plainly, then offer what *is* answerable: attendance, bench, the boss kill list, dates. Death/combat detail lives in WCL itself, which this agent does not fetch from; if a user wants it, it's a feature request.

**Capability check to run first when unsure** (`information_schema` *is* granted — table enumeration works):

```sql
select table_schema, table_name from information_schema.tables
where table_schema in ('public','views') order by 1,2;
```

⚠️ **`information_schema` silently hides ungranted relations.** It only lists what the `templar` role has grants on, so "it wasn't in the list" is NOT proof that Temple doesn't store something. To enumerate **every** relation in the database, granted or not, use `pg_catalog` (metadata is readable even where data is not):

```sql
select n.nspname as schema, c.relname as relation, c.relkind as kind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','v','m','p','f') and n.nspname not in ('pg_catalog','information_schema')
order by 1,2;
```

Verified Sep 2026: this reveals ungranted tables — for example `raid_plan_presence` and the `auth_*` / access-control tables — plus `auth_user`, `discord_role_binding`, `raid_plan_presence`, etc. **Distinguish "Temple doesn't store X" from "X exists but isn't granted to this connection" before answering a user** — they are very different claims, and the second one means "no read path via the bot", not "no data". Column detail for an ungranted table is still available via `pg_attribute` + `pg_class`.

### 10. Achievements — readable (SQL and GraphQL)

Temple has an achievements feature (site page `https://www.temple-era.com/achievements`). The tables are granted to this connection, and GraphQL v2 also exposes them per player (`Character.achievements` / `CharacterFamily.achievements`). Use GraphQL for "what has <name> earned?" and SQL for guild-wide questions.

- `public.achievement` — `id` uuid, `name`, `description`, `goal_description`, `icon`, `scope` (`season` | `all_time`), `season_id`, `rule_shape` (null = manual-grant only), `hidden`, timestamps
- `public.achievement_tier` — `id`, `achievement_id`, `tier` (`copper` < `silver` < `gold` < `thorium` < `arcanite`), `rule_config` jsonb. Not every achievement defines all five tiers.
- `public.achievement_award` — `id`, `achievement_tier_id`, **`primary_character_id`** (awarded at the character-*family* level, so resolve an alt to its primary first), `source` (`rule` | `manual`), `awarded_at`, `awarded_by_user_id` (null for rule awards), `seen_at`
- `public.season` — `id`, `name`, `start_date`, `end_date`

Crossing a tier inserts a row for every lower tier the achievement defines, so "holds Gold" means "has a Gold row".

```sql
-- One family's earned achievements, highest tier per achievement
select a.name, max(t.tier) as highest_tier, max(aw.awarded_at) as last_awarded
from public.achievement_award aw
join public.achievement_tier t on t.id = aw.achievement_tier_id
join public.achievement a on a.id = t.achievement_id
where aw.primary_character_id = (
  select coalesce(primary_character_id, character_id) from public.character where name = 'Name')
group by a.name
order by 2 desc, 1;
```

⚠️ **Hidden achievements are secret until earned.** `achievement.hidden = true` rows exist in the table whether or not anyone has earned them. Never list, count, name or hint at a hidden achievement the person asking about hasn't earned — filter a catalogue-style query with `where not a.hidden`, and only show a hidden one as part of a specific family's own earned results.

Answering "does Temple track achievements?" is a plain yes.

### Playbook pitfalls learned the hard way

- **camelCase columns need double quotes.** `raid_log."killCount"` — unquoted `rl.killcount` fails with `column rl.killcount does not exist`. Applies to any mixed-case column in this schema; the `HINT` in the error names the correct form.
- **`raid_log.kills` is NOT zone-scoped.** A log hung on a Naxx raid can carry another zone's bosses: raid 63 ("Naxx + AQ40 10/29") → 18 names, raid 42 → 22, because those nights ran both zones. Counting `unnest(kills)` raw makes those raids look like over-clears and makes mixed weeks look complete. **Always filter `k` to the target zone's boss list** when measuring a clear.
- **The 15 Naxxramas bosses** (exact stored strings): Anub'Rekhan, Grand Widow Faerlina, Maexxna, Noth the Plaguebringer, Heigan the Unclean, Loatheb, Instructor Razuvious, Gothik the Harvester, The Four Horsemen, Patchwerk, Grobbulus, Gluth, Thaddius, Sapphiron, Kel'Thuzad. The same column holds 60 distinct boss names across all zones (AQ40 `C'Thun`/`Twin Emperors`, MC `Ragnaros`, BWL `Nefarian`, ZG/AQ20/Onyxia) — `select distinct k from public.raid_log rl, unnest(rl.kills) k order by 1` enumerates them when you need another zone's set.
- **Full clear lists for the other 40-man zones** (max bosses, exact stored strings — verified live Sep 2026). Use these to filter `kills` before measuring any clear; ready-to-run SQL in `templates/zone-clear-audit.sql`.
  - `Molten Core` (10): Lucifron, Magmadar, Gehennas, Garr, Baron Geddon, Shazzrah, Sulfuron Harbinger, Golemagg the Incinerator, Majordomo Executus, Ragnaros
  - `Blackwing Lair` (8): Razorgore the Untamed, Vaelastrasz the Corrupt, Broodlord Lashlayer, Firemaw, Ebonroc, Flamegor, Chromaggus, Nefarian
  - `Temple of Ahn'Qiraj` (9): The Prophet Skeram, Silithid Royalty, Battleguard Sartura, Fankriss the Unyielding, Viscidus, Princess Huhuran, Twin Emperors, Ouro, C'Thun
  - Population Sep 2026: MC 175 raids, BWL 186, AQ40 144.
  - The cross-zone bleed in `kills` is measurable, not theoretical: 6 BWL-tagged logs carry MC bosses, 5 carry Onyxia, and 1 AQ40 log carries Naxx bosses. Unfiltered counts make those nights look like over-clears.
- **`unnest` + a zone-name filter needs an explicit lateral alias.** This shape errors with `column "k" does not exist` — the alias only exists if the unnest is in the FROM clause:
  ```sql
  -- WRONG
  select r.raid_id, count(distinct k) as bosses
  from public.raid r
  join public.raid_log rl on rl.raid_id = r.raid_id
  join zonelist z on z.zone = r.zone and z.boss = any(rl.kills)
  group by r.raid_id;
  -- RIGHT
  select r.raid_id, count(distinct k.bossname) as bosses
  from public.raid r
  join public.raid_log rl on rl.raid_id = r.raid_id
  cross join lateral unnest(rl.kills) as k(bossname)
  join zonelist z on z.zone = r.zone and z.boss = k.bossname
  group by r.raid_id;
  ```
  `count(distinct k.bossname)`, never `count(*)` — a boss downed twice in one night (Tuesday + cleanup) must count once. Building the zone boss list as a `zonelist` CTE of `select '<zone>', unnest(array[...]) union all ...` gives you both the per-zone max (`count(*) group by zone`) and the filter in one place.

