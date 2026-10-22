-- TEMPLE-150: raid_plan_encounter_note was the one raid-plan child table without a touch trigger,
-- so editing a note never bumped raid_plan.updated_at. That was harmless while updated_at was only
-- displayed as "last modified", but it is now the cache key for plan content
-- (src/server/services/raid-plan-content.ts) — without this, a note edit would keep serving the
-- old notes until some other part of the plan changed.
--
-- Notes hang off an encounter exactly like assignments do, so this reuses the same
-- touch_raid_plan_from_encounter() function as raid_plan_encounter_assignment_touch_parent.
DROP TRIGGER IF EXISTS raid_plan_encounter_note_touch_parent ON raid_plan_encounter_note;
--> statement-breakpoint
CREATE TRIGGER raid_plan_encounter_note_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON raid_plan_encounter_note
FOR EACH ROW
EXECUTE FUNCTION touch_raid_plan_from_encounter();
