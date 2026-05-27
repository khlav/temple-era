CREATE TABLE "raid_plan_encounter_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"icon_ref" varchar(128) NOT NULL,
	"text" varchar(128),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raid_plan_encounter_note" ADD CONSTRAINT "raid_plan_encounter_note_encounter_id_raid_plan_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."raid_plan_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raid_plan_encounter_note__encounter_id_sort_order_idx" ON "raid_plan_encounter_note" USING btree ("encounter_id","sort_order");
