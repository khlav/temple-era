CREATE TABLE "raid_plan_encounter_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" uuid NOT NULL,
	"group_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_template_encounter_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"group_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_group" ADD CONSTRAINT "raid_plan_encounter_group_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter_group" ADD CONSTRAINT "raid_plan_template_encounter_group_template_id_raid_plan_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."raid_plan_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_group__raid_plan_id_idx" ON "raid_plan_encounter_group" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_template_encounter_group__template_id_idx" ON "raid_plan_template_encounter_group" USING btree ("template_id");--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD CONSTRAINT "raid_plan_encounter_group_id_raid_plan_encounter_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."raid_plan_encounter_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" ADD CONSTRAINT "raid_plan_template_encounter_group_id_raid_plan_template_encounter_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."raid_plan_template_encounter_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_plan_encounter__group_id_idx" ON "raid_plan_encounter" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "raid_plan_template_encounter__group_id_idx" ON "raid_plan_template_encounter" USING btree ("group_id");