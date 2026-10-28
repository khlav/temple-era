-- TEMPLE-161: per-part versions for the raid plan content cache.
--
-- raid_plan.updated_at still moves on every change to a plan (clients poll it through
-- raidPlan.getVersion). What changes is the server cache behind getById/getPublicById
-- (src/server/services/raid-plan-content.ts): it used to be one entry per updated_at, so every
-- edit re-read the whole plan, about 150 AA-slot rows included. On raid night that was one full
-- read per edit, ~190 an hour. Now each part has its own version and an edit re-reads only its part:
--
--   raid_plan.roster_updated_at                 raid_plan_character
--   raid_plan.layout_updated_at                 raid_plan_encounter rows, raid_plan_encounter_group
--   raid_plan.default_aa_updated_at             default/trash AA: the plan's default_aa_template and
--                                               use_default_aa, and AA slots with raid_plan_id set
--   raid_plan.encounter_content_versions ->> id that encounter's assignments, notes and AA slots
--
-- Every version lives on the raid_plan row, so each trigger writes that one row and nothing else,
-- the same lock a child edit always took. Keeping encounter versions on the encounter rows would
-- lock encounter-then-plan, and a bulk edit across encounters could then deadlock with an edit to
-- a single encounter.
--
-- A new raid-plan child table needs a trigger here too, or edits to it are served stale.

-- Bump the plan's overall version and, when `part` names one, that part's version too. For
-- part = 'encounter', `encounter_id` names the encounter whose version moves.
CREATE OR REPLACE FUNCTION touch_raid_plan_part(
  target_plan_id varchar,
  part text,
  encounter_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF target_plan_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE raid_plan
  SET updated_at = CURRENT_TIMESTAMP,
      roster_updated_at = CASE WHEN part = 'roster' THEN CURRENT_TIMESTAMP ELSE roster_updated_at END,
      layout_updated_at = CASE WHEN part = 'layout' THEN CURRENT_TIMESTAMP ELSE layout_updated_at END,
      default_aa_updated_at =
        CASE WHEN part = 'default_aa' THEN CURRENT_TIMESTAMP ELSE default_aa_updated_at END,
      encounter_content_versions = CASE
        WHEN part = 'encounter' AND encounter_id IS NOT NULL
          THEN encounter_content_versions
            || jsonb_build_object(encounter_id::text, to_jsonb(CURRENT_TIMESTAMP))
        ELSE encounter_content_versions
      END
  WHERE id = target_plan_id;
END;
$$;
--> statement-breakpoint

-- An encounter's children changed. A plain SELECT finds the plan, so no encounter row is locked.
-- During a cascade from deleting the encounter it finds nothing and does nothing; the encounter's
-- own delete trigger moves the layout version.
CREATE OR REPLACE FUNCTION touch_raid_plan_encounter_content(target_encounter_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  plan_id varchar;
BEGIN
  IF target_encounter_id IS NULL THEN
    RETURN;
  END IF;

  SELECT raid_plan_id INTO plan_id FROM raid_plan_encounter WHERE id = target_encounter_id;
  PERFORM touch_raid_plan_part(plan_id, 'encounter', target_encounter_id);
END;
$$;
--> statement-breakpoint

-- Tables holding raid_plan_id directly. The part to bump is the trigger's first argument.
CREATE OR REPLACE FUNCTION touch_raid_plan_part_from_direct_fk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM touch_raid_plan_part(OLD.raid_plan_id, TG_ARGV[0]);
    RETURN OLD;
  END IF;

  PERFORM touch_raid_plan_part(NEW.raid_plan_id, TG_ARGV[0]);

  IF TG_OP = 'UPDATE' AND OLD.raid_plan_id IS DISTINCT FROM NEW.raid_plan_id THEN
    PERFORM touch_raid_plan_part(OLD.raid_plan_id, TG_ARGV[0]);
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Assignments and notes: always belong to one encounter.
CREATE OR REPLACE FUNCTION touch_raid_plan_encounter_from_child()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM touch_raid_plan_encounter_content(NEW.encounter_id);
  END IF;

  IF TG_OP = 'DELETE'
    OR (TG_OP = 'UPDATE' AND OLD.encounter_id IS DISTINCT FROM NEW.encounter_id) THEN
    PERFORM touch_raid_plan_encounter_content(OLD.encounter_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- AA slots: an encounter's (encounter_id set) or the plan's default/trash set (raid_plan_id set).
CREATE OR REPLACE FUNCTION touch_raid_plan_from_aa_slot_part()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.encounter_id IS NOT NULL THEN
      PERFORM touch_raid_plan_encounter_content(NEW.encounter_id);
    ELSE
      PERFORM touch_raid_plan_part(NEW.raid_plan_id, 'default_aa');
    END IF;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.encounter_id IS NOT NULL THEN
      PERFORM touch_raid_plan_encounter_content(OLD.encounter_id);
    ELSE
      PERFORM touch_raid_plan_part(OLD.raid_plan_id, 'default_aa');
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- The default/trash AA template lives on raid_plan itself. A BEFORE trigger so the version moves in
-- the same row write; updates that leave both columns alone (touchRaidPlanActor, togglePublic and
-- the touches above) don't move it.
CREATE OR REPLACE FUNCTION bump_raid_plan_default_aa_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.default_aa_template IS DISTINCT FROM OLD.default_aa_template
    OR NEW.use_default_aa IS DISTINCT FROM OLD.use_default_aa THEN
    NEW.default_aa_updated_at := CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_default_aa_version ON raid_plan;
--> statement-breakpoint
CREATE TRIGGER raid_plan_default_aa_version
BEFORE UPDATE ON raid_plan
FOR EACH ROW
EXECUTE FUNCTION bump_raid_plan_default_aa_version();
--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_character_touch_parent ON raid_plan_character;
--> statement-breakpoint
CREATE TRIGGER raid_plan_character_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_character
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_part_from_direct_fk('roster');
--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_encounter_group_touch_parent ON raid_plan_encounter_group;
--> statement-breakpoint
CREATE TRIGGER raid_plan_encounter_group_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_group
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_part_from_direct_fk('layout');
--> statement-breakpoint

-- The encounter row is layout: name, order, group, template, custom-groups flag.
DROP TRIGGER IF EXISTS raid_plan_encounter_touch_parent ON raid_plan_encounter;
--> statement-breakpoint
CREATE TRIGGER raid_plan_encounter_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_part_from_direct_fk('layout');
--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_encounter_assignment_touch_parent ON raid_plan_encounter_assignment;
--> statement-breakpoint
CREATE TRIGGER raid_plan_encounter_assignment_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_assignment
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_encounter_from_child();
--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_encounter_note_touch_parent ON raid_plan_encounter_note;
--> statement-breakpoint
CREATE TRIGGER raid_plan_encounter_note_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_note
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_encounter_from_child();
--> statement-breakpoint

DROP TRIGGER IF EXISTS raid_plan_encounter_aa_slot_touch_parent ON raid_plan_encounter_aa_slot;
--> statement-breakpoint
CREATE TRIGGER raid_plan_encounter_aa_slot_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_aa_slot
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_aa_slot_part();
--> statement-breakpoint

-- Replaced by the functions above; nothing else calls them.
DROP FUNCTION IF EXISTS touch_raid_plan_from_direct_fk();
--> statement-breakpoint
DROP FUNCTION IF EXISTS touch_raid_plan_from_encounter();
--> statement-breakpoint
DROP FUNCTION IF EXISTS touch_raid_plan_from_aa_slot();
--> statement-breakpoint
DROP FUNCTION IF EXISTS touch_raid_plan_timestamp(varchar);
