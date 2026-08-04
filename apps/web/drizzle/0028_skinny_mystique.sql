CREATE INDEX "raid_plan__is_public_idx" ON "raid_plan" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "raid_plan__start_at_idx" ON "raid_plan" USING btree ("start_at");