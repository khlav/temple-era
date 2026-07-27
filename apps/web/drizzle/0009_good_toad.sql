ALTER TABLE "raid_log" ADD COLUMN "discord_message_id" varchar(64);--> statement-breakpoint
CREATE INDEX "raid_log__discord_message_id_idx" ON "raid_log" USING btree ("discord_message_id");