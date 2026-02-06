CREATE TABLE "raid_plan_encounter_aa_slot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid,
	"raid_plan_id" uuid,
	"plan_character_id" uuid NOT NULL,
	"slot_name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD COLUMN "aa_template" text;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter" ADD COLUMN "use_custom_aa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_plan_template_encounter" ADD COLUMN "aa_template" text;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "default_aa_template" text;--> statement-breakpoint
ALTER TABLE "raid_plan" ADD COLUMN "use_default_aa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_encounter_id_raid_plan_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."raid_plan_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_raid_plan_id_raid_plan_id_fk" FOREIGN KEY ("raid_plan_id") REFERENCES "public"."raid_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_aa_slot" ADD CONSTRAINT "raid_plan_encounter_aa_slot_plan_character_id_raid_plan_character_id_fk" FOREIGN KEY ("plan_character_id") REFERENCES "public"."raid_plan_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aa_slot__encounter_id_idx" ON "raid_plan_encounter_aa_slot" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "aa_slot__raid_plan_id_idx" ON "raid_plan_encounter_aa_slot" USING btree ("raid_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aa_slot__unique_char_encounter" ON "raid_plan_encounter_aa_slot" USING btree ("encounter_id","plan_character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aa_slot__unique_char_plan" ON "raid_plan_encounter_aa_slot" USING btree ("raid_plan_id","plan_character_id");