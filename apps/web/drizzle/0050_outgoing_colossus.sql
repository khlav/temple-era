DROP INDEX "raid_log_attendee_map__raid_log_id_idx";--> statement-breakpoint
DROP INDEX "raid_log__raid_log_id_idx";--> statement-breakpoint
DROP INDEX "raid__raid_id_idx";--> statement-breakpoint
DROP INDEX "user__id_idx";--> statement-breakpoint
CREATE INDEX "raid_plan__updated_by_idx" ON "raid_plan" USING btree ("updated_by");