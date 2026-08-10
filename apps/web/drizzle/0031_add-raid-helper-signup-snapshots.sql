CREATE TYPE "public"."snapshot_checkpoint" AS ENUM('72h', '48h', '24h', '0h');--> statement-breakpoint
CREATE TABLE "raid_helper_signup_snapshot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"resolved_event_id" varchar(64) NOT NULL,
	"checkpoint" "snapshot_checkpoint" NOT NULL,
	"target_time" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"sign_up_count" integer NOT NULL,
	"signups" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "raid_helper_signup_snapshot__event_checkpoint_idx" ON "raid_helper_signup_snapshot" USING btree ("raid_helper_event_id","checkpoint");--> statement-breakpoint
CREATE INDEX "raid_helper_signup_snapshot__raid_helper_event_id_idx" ON "raid_helper_signup_snapshot" USING btree ("raid_helper_event_id");--> statement-breakpoint
CREATE INDEX "raid_helper_signup_snapshot__start_time_idx" ON "raid_helper_signup_snapshot" USING btree ("start_time");