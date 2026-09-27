-- Custom SQL migration file, put your code below! --
--
-- Everything the schema in src/server/db/schema.ts cannot express, at its FINAL state.
--
-- 0000_baseline.sql is pure `drizzle-kit generate` output: tables, columns, enums, PKs, FKs and
-- indexes, and nothing else. drizzle models none of what follows — `schemaFilter: ["public"]` in
-- drizzle.config.ts deliberately excludes the `views` schema, and extensions, roles, GRANTs,
-- functions, triggers and seed data have no representation in a Drizzle schema at all. So a
-- regenerated baseline on its own would silently drop all of it; this file is what carries it.
--
-- Squashed from the 13 hand-written migrations of the pre-squash 52-file chain (TEMPLE-135). Written
-- as end state rather than as a replay: where the old chain contradicted itself, only the final
-- result is here. Specifically, reports_readonly is created NOLOGIN (old 0029 created it LOGIN and
-- old 0030 immediately revoked that), and the raid-plan trigger functions are the varchar-typed
-- versions from old 0049, not the uuid-typed ones from old 0018 that it dropped and replaced.
--
-- Ordering matters in one place only: f_unaccent must exist before the functional index that uses
-- it, which is why the extension block precedes everything else. The views depend on the baseline's
-- tables, which is why this file runs second.

-- ============================================================================
-- Database timezone (was 0022_fix-lockout-views-et-timezone.sql)
-- ============================================================================

-- Set database timezone to Eastern Time so CURRENT_DATE in views reflects ET midnight,
-- aligning lockout week boundaries with the WoW Classic reset (Tuesday midnight ET).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/New_York');
END;
$$;
--> statement-breakpoint

-- ============================================================================
-- unaccent extension, IMMUTABLE wrapper, and its functional index (was 0008)
-- ============================================================================
-- Enable unaccent extension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create IMMUTABLE wrapper function for efficient indexing
-- This allows PostgreSQL to create and use indexes on unaccented text
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Create index using the wrapper function for fast accent-insensitive searches
CREATE INDEX IF NOT EXISTS idx_character_name_unaccent 
ON character (f_unaccent(name));
--> statement-breakpoint

-- ============================================================================
-- The views schema and the reporting views (was 0001_init_6w_reporting_views.sql)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS "views"
;

-- Remove existing views to ensure columns can be dropped/recreated.
DROP VIEW IF EXISTS views.primary_raid_attendance_l6lockoutwk;
DROP VIEW IF EXISTS views.primary_raid_attendee_and_bench_map;
DROP VIEW IF EXISTS views.primary_raid_attendee_map;
DROP VIEW IF EXISTS views.primary_raid_bench_map;
DROP VIEW IF EXISTS views.tracked_raids_l6lockoutwk;
DROP VIEW IF EXISTS views.tracked_raids_current_lockout;
DROP VIEW IF EXISTS views.all_raids_current_lockout;
DROP VIEW IF EXISTS views.report_dates;

-- Create views.report_dates
CREATE VIEW views.report_dates AS
SELECT (date_trunc('week', CURRENT_DATE - 1 - INTERVAL '6 weeks') + INTERVAL '1 day')::DATE AS report_period_start,
       (date_trunc('week', CURRENT_DATE - 1))::DATE                                         AS report_period_end;

-- Create views.primary_raid_attendee_map
CREATE VIEW views.primary_raid_attendee_map AS
SELECT rl.raid_id                                                 AS raid_id
     , COALESCE(c.primary_character_id, c.character_id)           as primary_character_id
     , ARRAY_AGG(DISTINCT c.character_id ORDER BY c.character_id) as attending_character_ids
FROM public.raid_log rl
         LEFT JOIN public.raid_log_attendee_map rlam ON rl.raid_log_id = rlam.raid_log_id
         LEFT JOIN public.character c ON c.character_id = rlam.character_id
WHERE rl.raid_id IS NOT NULL
  AND rlam.is_ignored = false
  and c.is_ignored = false
GROUP BY rl.raid_id, COALESCE(c.primary_character_id, c.character_id)
;

-- Create views.primary_raid_bench_map
CREATE VIEW views.primary_raid_bench_map AS
SELECT rbm.raid_id                                                AS raid_id
     , COALESCE(c.primary_character_id, c.character_id)           as primary_character_id
     , ARRAY_AGG(DISTINCT c.character_id ORDER BY c.character_id) as bench_character_ids
FROM public.raid_bench_map rbm
         LEFT JOIN public.character c ON c.character_id = rbm.character_id
WHERE c.is_ignored = false
GROUP BY rbm.raid_id, COALESCE(c.primary_character_id, c.character_id)
;

-- Create views.primary_raid_attendee_map_with_bench
CREATE VIEW views.primary_raid_attendee_and_bench_map AS
WITH all_raid_participation AS (SELECT COALESCE(a.raid_id, b.raid_id)                           as raid_id,
                                       COALESCE(a.primary_character_id, b.primary_character_id) as primary_character_id,
                                       COALESCE(
                                               CASE
                                                   WHEN a.attending_character_ids IS NOT NULL AND
                                                        b.bench_character_ids IS NOT NULL
                                                       THEN (SELECT array_agg(DISTINCT elem ORDER BY elem)
                                                             FROM unnest(a.attending_character_ids || b.bench_character_ids) elem)
                                                   ELSE COALESCE(a.attending_character_ids, b.bench_character_ids)
                                                   END,
                                               '{}'::integer[]
                                       )                                                        as all_character_ids,
                                       CASE
                                           WHEN a.primary_character_id IS NOT NULL AND b.primary_character_id IS NULL
                                               THEN 'attendee'
                                           WHEN a.primary_character_id IS NULL AND b.primary_character_id IS NOT NULL
                                               THEN 'bench'
                                           WHEN a.primary_character_id IS NOT NULL AND b.primary_character_id IS NOT NULL
                                               THEN 'attendee'
                                           END                                                  as attendee_or_bench
                                FROM views.primary_raid_attendee_map a
                                         FULL OUTER JOIN views.primary_raid_bench_map b
                                                         ON a.raid_id = b.raid_id
                                                             AND a.primary_character_id = b.primary_character_id),

     character_details AS (SELECT character_id, name
                           FROM public.character
                           WHERE is_ignored = false),

     raid_logs_by_raid_id AS (SELECT raid_id, array_agg(raid_log_id) as raid_log_ids
                              FROM public.raid_log
                              WHERE raid_id IS NOT NULL
                              GROUP BY raid_id)

SELECT arp.raid_id,
       arp.primary_character_id,
       arp.all_character_ids,
       arp.attendee_or_bench,
       ARRAY(
               SELECT json_build_object('characterId', c.character_id, 'name', c.name) -- camelCase to match TS when in use
               FROM unnest(arp.all_character_ids) AS unnested_character_id
                        LEFT JOIN character_details c ON c.character_id = unnested_character_id
       ) AS all_characters,
       rl.raid_log_ids
FROM all_raid_participation arp
         LEFT JOIN raid_logs_by_raid_id rl ON rl.raid_id = arp.raid_id
WHERE arp.primary_character_id IS NOT NULL
ORDER BY arp.raid_id, arp.primary_character_id
;

-- Create views.raids_l6lockoutwk
CREATE OR REPLACE VIEW views.tracked_raids_l6lockoutwk AS
SELECT
    r.*,
    (date_trunc('week', r.date - 1) + INTERVAL '1 day')::date as lockout_week
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - 1 - INTERVAL '6 weeks') + INTERVAL '1 day'
  AND r.date < date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
  AND r.attendance_weight > 0
ORDER BY date DESC
;

-- Create views.tracked_raids_current_lockout
CREATE OR REPLACE VIEW views.tracked_raids_current_lockout AS
SELECT r.*
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
  AND r.date <= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '7 day'
  AND r.attendance_weight > 0
ORDER BY date DESC
;

CREATE OR REPLACE VIEW views.all_raids_current_lockout AS
SELECT r.*
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
  AND r.date <= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '7 day'
ORDER BY date DESC
;

-- Create views.primary_raid_attendance_l6lockoutwk
CREATE OR REPLACE VIEW views.primary_raid_attendance_l6lockoutwk AS
WITH date_range AS (SELECT date_trunc('week', current_date - 1 - interval '6 weeks') + interval '1 day' AS start_date,
                           date_trunc('week', current_date - 1)                                         AS end_date),
     total_weight AS (
         SELECT
             ceil(DATE_PART('day',end_date - start_date) / 7)      as total_weeks,
             ceil(DATE_PART('day',end_date - start_date) / 7) * 3  as total,
             3                                                     as max_per_week
         FROM date_range
     ),
     character_attendance AS (
         SELECT
             c.character_id           as character_id,
             c.name                   as character_name,
             r.name                   as raid_name,
             r.zone,
             r.date,
             r.attendance_weight,
             prabm.attendee_or_bench,
             ROW_NUMBER() OVER (
                 PARTITION BY date_trunc('week', r.date::date - 1), c.character_id, r.zone
                 ORDER BY attendance_weight desc, date
                 ) AS rn
         FROM public.character c
                  JOIN views.primary_raid_attendee_and_bench_map prabm
                       ON c.character_id = prabm.primary_character_id
                  JOIN public.raid r ON prabm.raid_id = r.raid_id
         WHERE r.date BETWEEN (SELECT start_date FROM date_range) AND (SELECT end_date FROM date_range)
           AND r.attendance_weight > 0
           AND c.is_ignored = false
     ),
     weekly_attendance as (
         SELECT
             date_trunc('week', a.date-1)::date as raid_week,
             a.character_id,
             a.character_name,
             SUM(attendance_weight) AS weighted_attendance,
             LEAST(SUM(attendance_weight), tw.max_per_week) as week_total
                 ,
             array_agg(json_build_object(
                     'name', a.raid_name,
                     'zone', a.zone,
                     'date', a.date,
                     'attendanceWeight', a.attendance_weight,
                     'attendeeOrBench', a.attendee_or_bench
                       ))             as raids_attended_json
         FROM character_attendance a
                  CROSS JOIN total_weight tw
         WHERE a.rn = 1
         GROUP BY 1, 2, 3, tw.max_per_week
     )

SELECT
    character_id,
    character_name  as name,
    sum(week_total) as weighted_attendance,
    tw.total        as weighted_raid_total,
    COALESCE(sum(week_total) / NULLIF(tw.total, 0), 0) as weighted_attendance_pct
FROM weekly_attendance
         CROSS JOIN total_weight tw
group by character_id, character_name, tw.total
order by weighted_attendance_pct desc, character_name
;
--> statement-breakpoint

-- ============================================================================
-- Raid-plan updated_at trigger functions + triggers.
-- touch_raid_plan_timestamp and the two SELECT-INTO helpers are the varchar-typed final
-- versions (was 0049_raidplan-nanoid-finalize.sql, which dropped 0018's uuid-typed ones when
-- raid_plan.id became a nanoid); touch_raid_plan_from_direct_fk and the triggers themselves
-- are unchanged from 0018_touch-raid-plan-updated-at.sql.
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_raid_plan_timestamp(target_plan_id varchar) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF target_plan_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE raid_plan
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = target_plan_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION touch_raid_plan_from_encounter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_plan_id varchar;
  new_plan_id varchar;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT raid_plan_id
    INTO new_plan_id
    FROM raid_plan_encounter
    WHERE id = NEW.encounter_id;

    PERFORM touch_raid_plan_timestamp(new_plan_id);
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT raid_plan_id
    INTO old_plan_id
    FROM raid_plan_encounter
    WHERE id = OLD.encounter_id;

    PERFORM touch_raid_plan_timestamp(old_plan_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION touch_raid_plan_from_aa_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_plan_id varchar;
  new_plan_id varchar;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_plan_id := NEW.raid_plan_id;

    IF new_plan_id IS NULL AND NEW.encounter_id IS NOT NULL THEN
      SELECT raid_plan_id
      INTO new_plan_id
      FROM raid_plan_encounter
      WHERE id = NEW.encounter_id;
    END IF;

    PERFORM touch_raid_plan_timestamp(new_plan_id);
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    old_plan_id := OLD.raid_plan_id;

    IF old_plan_id IS NULL AND OLD.encounter_id IS NOT NULL THEN
      SELECT raid_plan_id
      INTO old_plan_id
      FROM raid_plan_encounter
      WHERE id = OLD.encounter_id;
    END IF;

    PERFORM touch_raid_plan_timestamp(old_plan_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION touch_raid_plan_from_direct_fk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM touch_raid_plan_timestamp(OLD.raid_plan_id);
    RETURN OLD;
  END IF;

  PERFORM touch_raid_plan_timestamp(NEW.raid_plan_id);

  IF TG_OP = 'UPDATE' AND OLD.raid_plan_id IS DISTINCT FROM NEW.raid_plan_id THEN
    PERFORM touch_raid_plan_timestamp(OLD.raid_plan_id);
  END IF;

  RETURN NEW;
END;
$$;


--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_character_touch_parent ON raid_plan_character;
CREATE TRIGGER raid_plan_character_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_character
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_direct_fk();

DROP TRIGGER IF EXISTS raid_plan_encounter_group_touch_parent ON raid_plan_encounter_group;
CREATE TRIGGER raid_plan_encounter_group_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_group
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_direct_fk();

DROP TRIGGER IF EXISTS raid_plan_encounter_touch_parent ON raid_plan_encounter;
CREATE TRIGGER raid_plan_encounter_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_direct_fk();

DROP TRIGGER IF EXISTS raid_plan_encounter_assignment_touch_parent ON raid_plan_encounter_assignment;
CREATE TRIGGER raid_plan_encounter_assignment_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_assignment
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_encounter();

DROP TRIGGER IF EXISTS raid_plan_encounter_aa_slot_touch_parent ON raid_plan_encounter_aa_slot;
CREATE TRIGGER raid_plan_encounter_aa_slot_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_aa_slot
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_aa_slot();

--> statement-breakpoint

-- ============================================================================
-- Read-only reporting roles and their grants, at final state.
-- Merged from 0029_add-templar-readonly-role.sql, 0030_convert-reports-readonly-to-group-role.sql
-- and 0051_grant-achievements-to-reports-readonly.sql. reports_readonly is a NOLOGIN
-- privilege-holding group role; templar is the LOGIN identity that inherits from it. Passwords
-- are set out-of-band and are deliberately not in any migration.
-- ============================================================================
-- Generic read-only service account scoped to guild reporting data (raids, attendance, recipes,
-- planning). Named for what it can touch, not who holds it: current consumer is the Templar
-- Discord bot (external, not in this repo — see root AGENTS.md "Hard constraint: Templar"),
-- which mediates ad hoc SQL access for guild officers so they aren't limited to the rigid v1/v2
-- APIs. Single account, not per-user.
--
-- Password is set out-of-band and handed to Templar separately — never committed here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'reports_readonly') THEN
    CREATE ROLE reports_readonly NOLOGIN;
  END IF;
END
$$;

COMMENT ON ROLE reports_readonly IS
  'Read-only service account for the Templar Discord bot''s ad hoc SQL query feature.';

-- Keep a bad ad hoc query from tying up the Supavisor pooler.
-- SUPERSEDED by 0002_templar_statement_timeout.sql: this line never took effect (a role-level GUC
-- is not inherited through membership, and reports_readonly is NOLOGIN), so 0002 resets it here and
-- sets 120s on `templar`, the login role, instead. Kept for replay fidelity — do not read it as live.
ALTER ROLE reports_readonly SET statement_timeout = '30s';

-- Postgres grants CREATE on public/views to the PUBLIC pseudo-role by default, and that's
-- additive on top of any role-specific grants — without revoking it, "read-only" would be a lie:
-- reports_readonly could still create objects in either schema via that implicit grant.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA views FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO reports_readonly;
GRANT USAGE ON SCHEMA views TO reports_readonly;

-- Explicit allow-list only — deliberately no ALTER DEFAULT PRIVILEGES, so a future table stays
-- invisible to this role until someone adds it here on purpose. Excludes everything under the
-- auth_* tables (OAuth tokens, session tokens, personal API tokens, email) and the access-control
-- tables (role/user_role/discord_role_binding/discord_pending_role_grant/discord_sync_state).
GRANT SELECT ON
  public.character,
  public.raid,
  public.raid_log,
  public.raid_log_attendee_map,
  public.raid_bench_map,
  public.recipes,
  public.character_spells,
  public.raid_plan_template,
  public.raid_plan_template_encounter_group,
  public.raid_plan_template_encounter,
  public.raid_plan,
  public.raid_plan_character,
  public.raid_plan_encounter_group,
  public.raid_plan_encounter,
  public.raid_plan_encounter_note,
  public.raid_plan_encounter_assignment,
  public.raid_plan_encounter_aa_slot
TO reports_readonly;

GRANT SELECT ON
  views.primary_raid_attendee_map,
  views.primary_raid_bench_map,
  views.primary_raid_attendee_and_bench_map,
  views.tracked_raids_l6lockoutwk,
  views.tracked_raids_current_lockout,
  views.all_raids_current_lockout,
  views.primary_raid_attendance_l6lockoutwk,
  views.report_dates
TO reports_readonly;

--> statement-breakpoint

-- Splits identity from privilege: reports_readonly becomes a pure NOLOGIN privilege-holding
-- role (all its SELECT grants from 0029 are untouched), and a separate LOGIN role — templar —
-- is granted membership in it. Templar connects as itself, not as reports_readonly directly, so
-- a future second consumer of the same reporting scope gets its own LOGIN role and its own
-- audit trail instead of sharing this credential.
--
-- Safe to disable reports_readonly's login in the same migration that creates templar: 0029
-- never set a password on reports_readonly, so nothing has ever been able to authenticate as it
-- — there is no live consumer to interrupt. templar's own password is set out-of-band post-merge
-- (TEMPLE-55), same as reports_readonly's would have been.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'templar') THEN
    CREATE ROLE templar LOGIN;
  END IF;
END
$$;

COMMENT ON ROLE templar IS
  'Login identity for the Templar Discord bot''s ad hoc SQL query feature. Privileges come
  entirely from membership in reports_readonly (see 0029_add-templar-readonly-role.sql).';

-- Default INHERIT means templar automatically has reports_readonly's grants without SET ROLE.
GRANT reports_readonly TO templar;

--> statement-breakpoint

-- Lets the read-only reporting role (templar, via reports_readonly — see 0029/0030) read earned
-- achievements, so guild-wide achievement reporting works over the ad hoc SQL connection.
--
-- Same explicit allow-list rule as 0029: no ALTER DEFAULT PRIVILEGES, so a future table stays
-- invisible to this role until someone adds it here on purpose. `season` rides along because
-- achievement.season_id points at it — without it a query can't say which season an achievement
-- belongs to. Read-only: SELECT only, no write grant of any kind (TEMPLE-124).
GRANT SELECT ON
  public.achievement,
  public.achievement_tier,
  public.achievement_award,
  public.season
TO reports_readonly;

--> statement-breakpoint

-- ============================================================================
-- Reference/seed data a fresh database needs.
-- The two is_system role rows (was 0026_backfill_roles_permissions_data.sql) and the recipe
-- catalog (was 0005_seed_recipes_table.sql + 0006_tearful_anthem.sql, merged). 0026's two
-- user_role backfills are deliberately NOT here: they existed to migrate users who already
-- held the legacy is_raid_manager/is_admin flags, which is meaningless on a fresh database.
-- 0006's ALTER TYPE ... ADD VALUE 'Cooking' is also gone: the baseline's CREATE TYPE already
-- includes it.
-- ============================================================================
-- Seed the two system roles that preserve current isRaidManager/isAdmin behavior exactly,
-- and backfill user_role for every currently-flagged user. Additive/idempotent — safe to
-- re-run. The legacy is_raid_manager/is_admin columns are left untouched as a rollback
-- safety net (see plan: dropped in a later, separate cleanup pass).
--
-- Admin's scopes are deliberately disjoint from Raid Manager's (Admin = userpermissions:manage only) so
-- the two system roles don't overlap. Every currently-flagged admin is also backfilled into
-- Raid Manager below so isRaidManager/isAdmin (derived from the union of a user's granted
-- scopes) both keep resolving exactly as before.

INSERT INTO "role" ("id", "name", "scopes", "is_system")
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Raid Manager',
    ARRAY['raidlog:manage','raidplan:manage','character:manage','softres:access','templar:access','api-token:access']::scope[],
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Admin',
    ARRAY['userpermissions:manage']::scope[],
    true
  )
ON CONFLICT ("name") DO NOTHING;

--> statement-breakpoint

INSERT INTO recipes (recipe_spell_id, item_id, profession, recipe, is_common, notes, tags)
VALUES
    (17634, 13506, 'Alchemy', 'Flask of Petrification', FALSE, 'Turns you to stone, immune to all attacks for 60 sec, but unable to act — situational escape/cheat-death utility', ARRAY['qol']),
    (17635, 13510, 'Alchemy', 'Flask of the Titans', FALSE, 'Mandatory for main tanks, recommended for melee in Naxx', ARRAY['bwl/mc', 'aq40', 'naxx', 'tank', 'melee']),
    (17636, 13511, 'Alchemy', 'Flask of Distilled Wisdom', FALSE, 'Recommended for healers in Naxx', ARRAY['aq40', 'naxx', 'healer']),
    (17637, 13512, 'Alchemy', 'Flask of Supreme Power', FALSE, 'Recommended for casters in Naxx', ARRAY['aq40', 'naxx', 'caster']),
    (17638, 13513, 'Alchemy', 'Flask of Chromatic Resistance', FALSE, 'On this list because it''s a flask. But no one should use this.', ARRAY[]::text[]),
    (24365, 20007, 'Alchemy', 'Mageblood Potion', FALSE, 'Recommended for healers, optional for casters', ARRAY['healer', 'caster']),
    (17574, 13457, 'Alchemy', 'Greater Fire Protection Potion', FALSE, 'Used by Healers in BWL and Melee in Naxx', ARRAY['bwl/mc', 'naxx', 'fireresist', 'healer', 'melee']),
    (17576, 13458, 'Alchemy', 'Greater Nature Protection Potion', FALSE, 'Mandatory for AQ40 (Huhuran, Viscidus)', ARRAY['aq40', 'natureresist', 'caster', 'melee', 'healer', 'ranged']),
    (17575, 13456, 'Alchemy', 'Greater Frost Protection Potion', FALSE, 'Mandatory for Naxx (Sapphiron, KT)', ARRAY['naxx', 'frostresist', 'caster', 'melee', 'healer', 'ranged']),
    (17578, 13459, 'Alchemy', 'Greater Shadow Protection Potion', FALSE, 'Mandatory for Naxx (Four Horsemen, Loatheb)', ARRAY['naxx', 'caster', 'melee', 'healer', 'ranged']),
    (17577, 13461, 'Alchemy', 'Greater Arcane Protection Potion', FALSE, 'Recommended for by Melee in MC (Shazz) and Naxx (Gothik)', ARRAY['bwl/mc', 'naxx', 'melee']),
    (6624, 5634, 'Alchemy', 'Free Action Potion', TRUE, 'Every instance has a FAP pull for melee and tanks', ARRAY['tank', 'melee']),
    (3175, 3387, 'Alchemy', 'Limited Invulnerability Potion', FALSE, 'Used by Warriors for shout taunts, and casters for aggro triage', ARRAY['tank', 'melee', 'caster']),
    (17570, 13455, 'Alchemy', 'Greater Stoneshield Potion', FALSE, 'Used by all main tanks for all raids, and melee on dangerous fights', ARRAY['tank', 'melee']),
    (17552, 13442, 'Alchemy', 'Mighty Rage Potion', FALSE, 'Warrior BIS damage consumable', ARRAY['melee']),
    (17573, 13454, 'Alchemy', 'Greater Arcane Elixir', FALSE, 'BIS Caster Consume', ARRAY['caster']),
    (11472, 9206, 'Alchemy', 'Elixir of Giants', FALSE, 'Cheap consumable for melee', ARRAY['tank', 'melee']),
    (26277, 21546, 'Alchemy', 'Elixir of Greater Firepower', FALSE, 'Fire Mage BIS', ARRAY['caster']),
    (11476, 9264, 'Alchemy', 'Elixir of Shadow Power', TRUE, 'Warlock BIS', ARRAY['caster']),
    (17571, 13452, 'Alchemy', 'Elixir of the Mongoose', TRUE, 'Staple for all physical DPS in every raid', ARRAY['melee']),
    (23653, 19169, 'Blacksmithing', 'Nightfall', FALSE, 'Offtank, Shamans, or Hunter can craft this elite item', ARRAY['weapon', 'melee', 'ranged', 'healer']),
    (16729, 12640, 'Blacksmithing', 'Lionheart Helm', FALSE, 'BiS for fury warriors throughout all raid tiers', ARRAY['head', 'melee']),
    (23636, 19148, 'Blacksmithing', 'Dark Iron Helm', FALSE, 'Only Main Tanks needs this for a small number of fights', ARRAY['head', 'bwl/mc', 'naxx', 'tank', 'fireresist']),
    (24399, 20039, 'Blacksmithing', 'Dark Iron Boots', FALSE, 'Only Main Tanks needs this for a small number of fights', ARRAY['feet', 'bwl/mc', 'naxx', 'tank', 'fireresist']),
    (23637, 19164, 'Blacksmithing', 'Dark Iron Gauntlets', FALSE, 'Only Main Tanks needs this for a small number of fights', ARRAY['hands', 'bwl/mc', 'naxx', 'tank', 'fireresist']),
    (16741, 12639, 'Blacksmithing', 'Stronghold Gauntlets', FALSE, 'Anti-disarm gloves', ARRAY['hands', 'melee']),
    (27829, 22385, 'Blacksmithing', 'Titanic Leggings', FALSE, 'Fury warriors for all raids until AQ40/Naxx upgrades', ARRAY['legs', 'melee']),
    (20876, 17013, 'Blacksmithing', 'Dark Iron Leggings', FALSE, 'Only Main Tanks needs this for a small number of fights', ARRAY['legs', 'bwl/mc', 'naxx', 'tank', 'fireresist']),
    (20874, 17014, 'Blacksmithing', 'Dark Iron Bracers', FALSE, 'Only Main Tanks needs this for a small number of fights', ARRAY['wrist', 'bwl/mc', 'naxx', 'tank', 'fireresist']),
    (9964, 7969, 'Blacksmithing', 'Mithril Spurs', TRUE, 'Quality-of-life for all classes, not raid specific', ARRAY['qol']),
    (7222, 6043, 'Blacksmithing', 'Iron Counterweight', FALSE, 'Pair this with Nightfall specifically', ARRAY['melee']),
    (16651, 12645, 'Blacksmithing', 'Thorium Shield Spike', FALSE, 'This object uses a buff slot and should not be used in raids', ARRAY['shield', 'tank']),
    (22757, 18262, 'Blacksmithing', 'Elemental Sharpening Stone', FALSE, 'Used by Warriors on Offhand weapon and Hunters ', ARRAY['melee', 'ranged']),
    (20201, 16206, 'Blacksmithing', 'Arcanite Rod', TRUE, 'Crafting material for enchanting, not directly used in raids', ARRAY['component']),
    (16991, 12798, 'Blacksmithing', 'Annilhilator', FALSE, 'Offtank, Shamans, or Hunter can craft this elite item', ARRAY['weapon', 'melee', 'ranged', 'healer']),
    (27590, 22191, 'Blacksmithing', 'Obsidian Mail Tunic', FALSE, 'Alternative to farming Savage Gladiator Chain', ARRAY['chest', 'melee']),
    (20034, NULL, 'Enchanting', 'Enchant Weapon - Crusader', FALSE, 'Top enchant for melee DPS and tanks in all raids', ARRAY['tank', 'melee']),
    (22749, NULL, 'Enchanting', 'Enchant Weapon - Spellpower (+30)', FALSE, 'Essential for all caster DPS across all raid tiers', ARRAY['caster']),
    (22750, NULL, 'Enchanting', 'Enchant Weapon - Healing Power (+55)', FALSE, 'BiS for all healers throughout all raid content', ARRAY['healer']),
    (23800, NULL, 'Enchanting', 'Enchant Weapon - Agility (+15)', FALSE, 'Used by hunters for all raid content, situational offhand enchant for melee', ARRAY['melee', 'ranged']),
    (27837, NULL, 'Enchanting', 'Enchant 2H Weapon - Agility (+25)', FALSE, 'Used by hunters for all raid content', ARRAY['ranged']),
    (25086, NULL, 'Enchanting', 'Enchant Cloak - Dodge (+1%)', FALSE, 'Tanking enchant, situationally BIS', ARRAY['tank']),
    (13657, NULL, 'Enchanting', 'Enchant Cloak - Fire Resistance (+7)', TRUE, 'Typically paired with Onyxia Scale Cloak', ARRAY['bwl/mc', 'fireresist']),
    (25082, NULL, 'Enchanting', 'Enchant Cloak - Greater Nature Resistance (+15)', FALSE, 'Nature Resist for Soakers, pair with Gaea''s Embrace', ARRAY['aq40', 'natureresist']),
    (25084, NULL, 'Enchanting', 'Enchant Cloak - Subtlety', FALSE, 'Arguably BIS, depends on your damage', ARRAY['caster', 'melee']),
    (13882, NULL, 'Enchanting', 'Enchant Cloak - Lesser Agility (+3)', FALSE, 'BIS melee/hunter DPS enchant', ARRAY['melee', 'ranged']),
    (20014, NULL, 'Enchanting', 'Enchant Cloak - Greater Resistance (+5 all)', FALSE, 'General resistance enchant for most classes', ARRAY['caster', 'melee', 'healer', 'ranged', 'fireresist', 'natureresist', 'frostresist']),
    (20025, NULL, 'Enchanting', 'Enchant Chest - Greater Stats (+4)', FALSE, 'BiS for all classes across all raid tiers', ARRAY['tank', 'caster', 'melee', 'healer', 'ranged']),
    (20026, NULL, 'Enchanting', 'Enchant Chest - Major Health (+100)', FALSE, 'Preferred enchantment for resist gear', ARRAY['fireresist', 'natureresist', 'frostresist']),
    (20028, NULL, 'Enchanting', 'Enchant Chest - Major Mana (+100)', FALSE, 'Alternative for healers and casters', ARRAY['healer', 'caster']),
    (13941, NULL, 'Enchanting', 'Enchant Chest - Stats (+3)', TRUE, 'Budget option for chest', ARRAY['tank', 'caster', 'melee', 'healer', 'ranged']),
    (20023, NULL, 'Enchanting', 'Enchant Boots - Greater Agility (+7)', FALSE, 'Arguably BIS agility class enchant', ARRAY['melee', 'ranged']),
    (20020, NULL, 'Enchanting', 'Enchant Boots - Greater Stamina (+7)', FALSE, 'Arguably BIS for all classes', ARRAY['tank', 'caster', 'melee', 'healer', 'ranged']),
    (13890, NULL, 'Enchanting', 'Enchant Boots - Minor Speed', TRUE, 'Arguably BIS for all non-agility classes', ARRAY['tank', 'caster', 'healer']),
    (25080, NULL, 'Enchanting', 'Enchant Gloves - Superior Agility (+15)', FALSE, 'BIS for Hunter/Rogue and Tanks', ARRAY['melee', 'ranged', 'tank']),
    (25073, NULL, 'Enchanting', 'Enchant Gloves - Shadow Power (+20)', FALSE, 'Warlock BIS enchantment', ARRAY['caster']),
    (25079, NULL, 'Enchanting', 'Enchant Gloves - Healing Power (+30)', FALSE, 'Healer BIS enchantment', ARRAY['healer']),
    (25078, NULL, 'Enchanting', 'Enchant Gloves - Fire Power (+20)', FALSE, 'Mages for AQ40 and later Fire Spec', ARRAY['caster']),
    (20017, NULL, 'Enchanting', 'Enchant Shield - Greater Stamina (+7)', FALSE, 'Warrior and Shaman BIS', ARRAY['tank']),
    (23802, NULL, 'Enchanting', 'Enchant Bracer - Healing Power (+24)', FALSE, 'BiS for all healers in every raid', ARRAY['healer']),
    (23801, NULL, 'Enchanting', 'Enchant Bracer - Mana Regeneration (+4)', FALSE, 'Alternative for healers in mana-intensive fights', ARRAY['healer', 'caster']),
    (20011, NULL, 'Enchanting', 'Enchant Bracer - Superior Stamina (+9)', FALSE, 'Tanks enchantment, also preferred on resistance gear', ARRAY['tank', 'fireresist', 'natureresist', 'frostresist']),
    (20010, NULL, 'Enchanting', 'Enchant Bracer - Superior Strength (+9)', FALSE, 'Warrior/Rogue BIS', ARRAY['tank', 'melee']),
    (25130, 20748, 'Enchanting', 'Brilliant Mana Oil', FALSE, 'BIS for healers', ARRAY['healer']),
    (17181, 12810, 'Enchanting', 'Enchanted Leather', TRUE, 'Crafting material, not directly used in raids', ARRAY['component']),
    (17180, 12655, 'Enchanting', 'Enchanted Thorium', TRUE, 'Crafting material, not directly used in raids', ARRAY['component']),
    (25129, 20749, 'Enchanting', 'Brilliant Wizard Oil', FALSE, 'BIS for casters', ARRAY['caster']),
    (22793, 18283, 'Engineering', 'Biznicks 247x128 Accurascope', FALSE, 'BIS Hunter enchant', ARRAY['ranged']),
    (22797, 18168, 'Engineering', 'Force Reactive Disk', FALSE, 'Niche use for AoE tanking in MC (Garr adds)', ARRAY['shield', 'bwl/mc', 'tank']),
    (28208, 22658, 'Tailoring', 'Glacial Cloak', FALSE, 'ALL CLASSES for Naxx (Sapphiron)', ARRAY['back', 'naxx', 'caster', 'healer', 'ranged', 'melee', 'frostresist']),
    (28207, 22652, 'Tailoring', 'Glacial Vest', FALSE, 'Casters and Healers for Naxx (Sapphiron)', ARRAY['chest', 'naxx', 'caster', 'healer', 'frostresist', 'ranged', 'melee']),
    (28205, 22654, 'Tailoring', 'Glacial Gloves', FALSE, 'Casters and Healers for Naxx (Sapphiron)', ARRAY['hands', 'naxx', 'caster', 'healer', 'frostresist', 'ranged', 'melee']),
    (28209, 22655, 'Tailoring', 'Glacial Wrists', FALSE, 'Casters and Healers for Naxx (Sapphiron)', ARRAY['wrist', 'naxx', 'caster', 'healer', 'frostresist', 'ranged', 'melee']),
    (28210, 22660, 'Tailoring', 'Gaea''s Embrace', FALSE, 'Required for AQ40 (Huhuran, Viscidus) by ALL CLASSES', ARRAY['back', 'aq40', 'natureresist', 'caster', 'healer', 'ranged', 'melee']),
    (28481, 22757, 'Tailoring', 'Sylvan Crown', FALSE, 'Required for AQ40 (Huhuran, Viscidus) by ALL CLASSES', ARRAY['head', 'aq40', 'natureresist', 'caster', 'healer', 'ranged', 'melee']),
    (28482, 22758, 'Tailoring', 'Sylvan Shoulders', FALSE, 'Required for AQ40 (Huhuran, Viscidus) by ALL CLASSES', ARRAY['shoulders', 'aq40', 'natureresist', 'caster', 'healer', 'ranged', 'melee']),
    (28480, 22756, 'Tailoring', 'Sylvan Vest', FALSE, 'Required for AQ40 (Huhuran, Viscidus) by ALL CLASSES', ARRAY['chest', 'aq40', 'natureresist', 'caster', 'healer', 'ranged', 'melee']),
    (18418, 14044, 'Tailoring', 'Cindercloth Cloak', FALSE, 'Component for Onyxia Scale Cloak', ARRAY['back', 'bwl/mc', 'component']),
    (24091, 19682, 'Tailoring', 'Bloodvine Vest', FALSE, 'BiS for most casters in ZG/MC/BWL phase', ARRAY['chest', 'caster']),
    (24093, 19684, 'Tailoring', 'Bloodvine Boots', FALSE, 'BiS for most casters in ZG/MC/BWL phase', ARRAY['feet', 'caster']),
    (24092, 19683, 'Tailoring', 'Bloodvine Leggings', FALSE, 'BiS for most casters in ZG/MC/BWL phase', ARRAY['legs', 'caster']),
    (24902, 20539, 'Tailoring', 'Runed Stygian Belt', FALSE, 'Warlock Tanking gear for AQ40 (Twin Emperors)', ARRAY['waist', 'aq40', 'caster']),
    (24903, 20537, 'Tailoring', 'Runed Stygian Boots', FALSE, 'Warlock Tanking gear for AQ40 (Twin Emperors)', ARRAY['feet', 'aq40', 'caster']),
    (24901, 20538, 'Tailoring', 'Runed Stygian Leggings', FALSE, 'Warlock Tanking gear for AQ40 (Twin Emperors)', ARRAY['legs', 'aq40', 'caster']),
    (18445, 14155, 'Tailoring', 'Mooncloth Bag', FALSE, 'Cheap 16-slot bag', ARRAY['qol']),
    (18455, 14156, 'Tailoring', 'Bottomless Bag', FALSE, 'Largest bag in the game', ARRAY['qol']),
    (26087, 21342, 'Tailoring', 'Core Felcloth Bag', FALSE, 'Quality-of-life item for Warlocks', ARRAY['caster', 'qol']),
    (22927, 18510, 'Leatherworking', 'Hide of the Wild', FALSE, 'BiS for healers throughout most raid tiers', ARRAY['back', 'healer']),
    (19093, 15138, 'Leatherworking', 'Onyxia Scale Cloak', FALSE, 'Required for all raiders for BWL', ARRAY['back', 'bwl/mc', 'fireresist']),
    (28219, 22661, 'Leatherworking', 'Polar Tunic', FALSE, 'Required for Rogues in Naxx (Sapphiron)', ARRAY['chest', 'naxx', 'frostresist', 'melee']),
    (28220, 22662, 'Leatherworking', 'Polar Gloves', FALSE, 'Required for Rogues in Naxx (Sapphiron)', ARRAY['hands', 'naxx', 'frostresist', 'melee']),
    (28221, 22663, 'Leatherworking', 'Polar Bracers', FALSE, 'Required for Rogues in Naxx (Sapphiron)', ARRAY['wrist', 'naxx', 'frostresist', 'melee']),
    (23709, 19162, 'Leatherworking', 'Corehound Belt', FALSE, 'BiS for Shamans and Druids throughout most raid tiers', ARRAY['waist', 'healer']),
    (22727, 18251, 'Leatherworking', 'Core Armor Kit', FALSE, 'For aspiring Feral Tanks specifically', ARRAY['tank']),
    (23190, 18662, 'Leatherworking', 'Heavy Leather Ball', TRUE, 'Grief your friends!', ARRAY['qol']),
    (28222, 22664, 'Leatherworking', 'Icy Scale Breastplate', FALSE, 'Required for Warriors and Hunters in Naxx (Sapphiron)', ARRAY['chest', 'naxx', 'ranged', 'melee', 'frostresist']),
    (28223, 22666, 'Leatherworking', 'Icy Scale Gauntlets', FALSE, 'Required for Warriors and Hunters in Naxx (Sapphiron)', ARRAY['hands', 'naxx', 'ranged', 'melee', 'frostresist']),
    (28224, 22665, 'Leatherworking', 'Icy Scale Bracers', FALSE, 'Required for Warriors and Hunters in Naxx (Sapphiron)', ARRAY['wrist', 'naxx', 'ranged', 'melee', 'frostresist']),
    (25081, NULL, 'Enchanting', 'Enchant Cloak - Greater Fire Resistance (+15)', FALSE, 'Typically paired with Onyxia Scale Cloak', ARRAY['bwl/mc', 'fireresist']),
    (3872, 4335, 'Tailoring', 'Rich Purple Silk Shirt', FALSE, 'BiS drip for all characters', ARRAY['qol']),
    (25074, NULL, 'Enchanting', 'Enchant Gloves - Frost Power (+20)', FALSE, 'Frost Mage BiS', ARRAY['caster']),
    (13933, NULL, 'Enchanting', 'Enchant Shield - Frost Resistance (+8)', FALSE, 'Helpful for Naxx Tanks (Sapphiron, KT)', ARRAY['naxx', 'tank', 'frostresist']),
    (13689, NULL, 'Enchanting', 'Enchant Shield - Lesser Block (+2%)', FALSE, 'More block means less death. In theory.', ARRAY['tank']),
    (23803, NULL, 'Enchanting', 'Enchant Weapon - Mighty Spirit (+20)', FALSE, 'Evocate BiS', ARRAY['healer']),
    (23804, NULL, 'Enchanting', 'Enchant Weapon - Mighty Intellect (+22)', FALSE, 'Alternative for casters/healers vs. +sp or +hp', ARRAY['caster', 'healer']),
    -- (25659, 21023, 'Cooking', 'Dirge''s Kickin'' Chimaerok Chops', FALSE, 'BiS food for endgame tanking', ARRAY['tank', 'aq40', 'naxx']),
    -- (8238, 6657, 'Cooking', 'Savory Deviate Delight', FALSE, 'Yarr or *silence*', ARRAY['pirate', 'ninja']),
    (27660, 22249, 'Tailoring', 'Big Bag of Enchantment', FALSE, 'It''d be easier to vendor your low-level enchant mats. But just in case...', ARRAY['qol']),
    (27725, 22252, 'Tailoring', 'Satchel of Cenarius', FALSE, 'Holds herbs. Handy.', ARRAY['qol']),
    (12081, 10030, 'Tailoring', 'Admiral''s Hat', FALSE, 'BiS Yarr.', ARRAY['pirate']),
    (20029, NULL, 'Enchanting', 'Enchant Weapon - Icy Chill', FALSE, 'For Coldrage Daggers on Viscidous', ARRAY['aq40', 'melee']),
    (20853, 16982, 'Leatherworking', 'Corehound Boots', FALSE, 'Fire resist boots for Feral Druids and Rogues in BWL/MC', ARRAY['feet', 'bwl/mc', 'melee', 'fireresist']),
    (23707, 19149, 'Leatherworking', 'Lava Belt', FALSE, 'Fire resist belt for Feral Druids and Rogues in BWL/MC', ARRAY['waist', 'bwl/mc', 'melee', 'fireresist']),
    (20854, 16983, 'Leatherworking', 'Molten Helm', FALSE, 'Fire resist helm for Feral Druids and Rogues in BWL/MC', ARRAY['head', 'bwl/mc', 'melee', 'fireresist']),
    (21161, 17193, 'Blacksmithing', 'Sulfuron Hammer', FALSE, 'Combines with Eye of Sulfuras to create Sulfuras, Hand of Ragnaros', ARRAY['bwl/mc', 'weapon', 'component'])
ON CONFLICT (recipe_spell_id) DO NOTHING;

--> statement-breakpoint


INSERT INTO recipes (recipe_spell_id, item_id, profession, recipe, is_common, notes, tags)
VALUES
    (25659, 21023, 'Cooking', 'Dirge''s Kickin'' Chimaerok Chops', FALSE, 'BiS food for endgame tanking', ARRAY['tank', 'aq40', 'naxx']),
    (8238, 6657, 'Cooking', 'Savory Deviate Delight', FALSE, 'Yarr or *silence*', ARRAY['pirate', 'ninja'])
ON CONFLICT (recipe_spell_id) DO NOTHING;
