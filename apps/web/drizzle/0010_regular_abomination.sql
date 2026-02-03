CREATE TABLE "raid_plan_character" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" uuid NOT NULL,
	"character_id" integer,
	"character_name" varchar(128) NOT NULL,
	"default_group" integer,
	"default_position" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"plan_character_id" uuid NOT NULL,
	"group_number" integer,
	"position" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_plan_id" uuid NOT NULL,
	"encounter_key" varchar(64) NOT NULL,
	"encounter_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"use_default_groups" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_template_encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"encounter_key" varchar(64) NOT NULL,
	"encounter_name" varchar(256) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" varchar(64) NOT NULL,
	"zone_name" varchar(256) NOT NULL,
	"default_group_count" integer DEFAULT 8 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raid_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" integer,
	"zone_id" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raid_plan_character" ADD CONSTRAINT "raid_plan_character_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_character" ADD CONSTRAINT "raid_plan_character_character_id_character_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("character_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_assignment" ADD CONSTRAINT "raid_plan_encounter_assignment_encounter_id_raid_plan_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."raid_plan_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_assignment" ADD CONSTRAINT "raid_plan_encounter_assignment_plan_character_id_raid_plan_character_id_fk" FOREIGN KEY ("plan_character_id") REFERENCES "public"."raid_plan_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD CONSTRAINT "raid_plan_encounter_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" ADD CONSTRAINT "raid_plan_template_encounter_template_id_raid_plan_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."raid_plan_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_template" ADD CONSTRAINT "raid_plan_template_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_event_id_raid_raid_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."raid"("raid_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD CONSTRAINT "raid_plan_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_plan_character__raid_plan_id_idx" ON "raid_plan_character" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_character__character_id_idx" ON "raid_plan_character" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_assignment__encounter_id_idx" ON "raid_plan_encounter_assignment" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter_assignment__plan_character_id_idx" ON "raid_plan_encounter_assignment" USING btree ("plan_character_id");--> statement-breakpoint
CREATE INDEX "raid_plan_encounter__raid_plan_id_idx" ON "raid_plan_encounter" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE INDEX "raid_plan_template_encounter__template_id_idx" ON "raid_plan_template_encounter" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_template__zone_id_idx" ON "raid_plan_template" USING btree ("zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan__event_id_idx" ON "raid_plan" USING btree ("event_id");