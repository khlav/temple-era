DROP INDEX "aa_slot__unique_char_encounter";--> statement-breakpoint
DROP INDEX "aa_slot__unique_char_plan";--> statement-breakpoint
CREATE INDEX "aa_slot__plan_character_id_idx" ON "raid_plan_encounter_aa_slot" USING btree ("plan_character_id");--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" DROP COLUMN "include_aa_by_default";--> statement-breakpoint
ALTER TABLE "raid_plan_template" DROP COLUMN "include_default_aa_by_default";