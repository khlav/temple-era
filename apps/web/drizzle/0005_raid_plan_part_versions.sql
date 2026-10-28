ALTER TABLE "raid_plan" ADD COLUMN "roster_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "layout_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "default_aa_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "encounter_content_versions" jsonb DEFAULT '{}'::jsonb NOT NULL;