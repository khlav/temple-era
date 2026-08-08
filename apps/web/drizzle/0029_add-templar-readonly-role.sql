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
    CREATE ROLE reports_readonly LOGIN;
  END IF;
END
$$;

COMMENT ON ROLE reports_readonly IS
  'Read-only service account for the Templar Discord bot''s ad hoc SQL query feature.';

-- Keep a bad ad hoc query from tying up the Supavisor pooler.
ALTER ROLE reports_readonly SET statement_timeout = '30s';

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
