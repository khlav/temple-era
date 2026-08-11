ALTER TABLE "raid_signup_snapshot_link" DROP CONSTRAINT "raid_signup_snapshot_link_reviewed_by_id_auth_user_id_fk";
--> statement-breakpoint
DROP INDEX "raid_signup_snapshot_link__raid_event_start_idx";--> statement-breakpoint
DROP INDEX "raid_signup_snapshot_link__status_idx";--> statement-breakpoint
DROP INDEX "raid_signup_snapshot_link__raid_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "raid_signup_snapshot_link__raid_id_idx" ON "raid_signup_snapshot_link" USING btree ("raid_id");--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" DROP COLUMN "reviewed_by_id";--> statement-breakpoint
ALTER TABLE "raid_signup_snapshot_link" DROP COLUMN "reviewed_at";--> statement-breakpoint
DROP TYPE "public"."raid_signup_link_status";