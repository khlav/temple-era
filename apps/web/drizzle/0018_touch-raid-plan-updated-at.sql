CREATE OR REPLACE FUNCTION touch_raid_plan_timestamp(target_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_plan_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE raid_plan
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = target_plan_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION touch_raid_plan_from_encounter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_plan_id uuid;
  new_plan_id uuid;
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

CREATE OR REPLACE FUNCTION touch_raid_plan_from_aa_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_plan_id uuid;
  new_plan_id uuid;
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
