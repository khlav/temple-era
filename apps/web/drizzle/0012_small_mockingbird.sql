ALTER TABLE "raid_plan_template_encounter" ADD COLUMN "include_aa_by_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_plan_template" ADD COLUMN "default_aa_template" text;--> statement-breakpoint
ALTER TABLE "raid_plan_template" ADD COLUMN "include_default_aa_by_default" boolean DEFAULT false NOT NULL;