CREATE TYPE "public"."raid_signup_link_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."raid_signup_link_status" AS ENUM('candidate', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "raid_signup_snapshot_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_id" integer NOT NULL,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"status" "raid_signup_link_status" DEFAULT 'candidate' NOT NULL,
	"source" "raid_signup_link_source" DEFAULT 'auto' NOT NULL,
	"confidence" real NOT NULL,
	"match_reason" jsonb NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "title" varchar(256);--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "channel_name" varchar(128);--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "channel_id" varchar(64);--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "softres_id" varchar(64);--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "scheduled_id" varchar(64);--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "zone" varchar(64);--> statement-breakpoint
ALTER TABLE "raid_helper_signup_snapshot" ADD COLUMN "zone_source" varchar(16);--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" ADD CONSTRAINT "raid_signup_snapshot_link_raid_id_raid_raid_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raid"("raid_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" ADD CONSTRAINT "raid_signup_snapshot_link_reviewed_by_id_auth_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" ADD CONSTRAINT "raid_signup_snapshot_link_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raid_signup_snapshot_link__raid_event_start_idx" ON "raid_signup_snapshot_link" USING btree ("raid_id","raid_helper_event_id","start_time");--> statement-breakpoint
CREATE INDEX "raid_signup_snapshot_link__event_start_idx" ON "raid_signup_snapshot_link" USING btree ("raid_helper_event_id","start_time");--> statement-breakpoint
CREATE INDEX "raid_signup_snapshot_link__raid_id_idx" ON "raid_signup_snapshot_link" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX "raid_signup_snapshot_link__status_idx" ON "raid_signup_snapshot_link" USING btree ("status");