-- Migrate raid_plan from a UUID primary key to a nanoid (shorter, URL-friendly).
-- Step 1 of 3: purely additive — new nullable columns alongside the existing ones.
-- legacy_uuid preserves each plan's original id for old-link redirects; new_id/
-- new_raid_plan_id hold the nanoid values assigned in the next migration.

ALTER TABLE "raid_plan" ADD COLUMN "legacy_uuid" uuid;
--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "new_id" varchar(8);
--> statement-breakpoint
ALTER TABLE "raid_plan_character" ADD COLUMN "new_raid_plan_id" varchar(8);
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_group" ADD COLUMN "new_raid_plan_id" varchar(8);
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD COLUMN "new_raid_plan_id" varchar(8);
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD COLUMN "new_raid_plan_id" varchar(8);
--> statement-breakpoint
ALTER TABLE "raid_plan_presence" ADD COLUMN "new_raid_plan_id" varchar(8);
