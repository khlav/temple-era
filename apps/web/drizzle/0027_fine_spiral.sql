CREATE INDEX "character_spells__recipe_spell_id_idx" ON "character_spells" USING btree ("recipe_spell_id");--> statement-breakpoint
CREATE INDEX "character__is_ignored_idx" ON "character" USING btree ("is_ignored");--> statement-breakpoint
CREATE INDEX "character__primary_character_id_idx" ON "character" USING btree ("primary_character_id");--> statement-breakpoint
CREATE INDEX "raid_log__raid_id_idx" ON "raid_log" USING btree ("raid_id");--> statement-breakpoint
CREATE INDEX "raid__date_idx" ON "raid" USING btree ("date");