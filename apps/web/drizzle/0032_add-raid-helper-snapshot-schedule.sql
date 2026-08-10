CREATE TABLE "raid_helper_signup_snapshot_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"raid_helper_event_id" varchar(64) NOT NULL,
	"checkpoint" "snapshot_checkpoint" NOT NULL,
	"qstash_message_id" varchar(128) NOT NULL,
	"scheduled_for_start_time" timestamp with time zone NOT NULL,
	"target_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "raid_helper_signup_snapshot_schedule__event_checkpoint_idx" ON "raid_helper_signup_snapshot_schedule" USING btree ("raid_helper_event_id","checkpoint");