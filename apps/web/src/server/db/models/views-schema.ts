import {
  pgSchema,
  integer,
  varchar,
} from "drizzle-orm/pg-core";
import {characters, raids} from "~/server/db/models/raid-schema";

// Note: Views kept in a separate file to remain reference-able
//       in different contexts without causing drizzle-kit errors

const viewSchema = pgSchema("views");
export const raidAttendeeMap = viewSchema.view(
  "raid_attendee_map",
  {
    raidId: integer("raid_id").references(() => raids.raidId),
    primaryCharacterId: integer("primary_character_id").references(() => characters.characterId),
    characterCount: integer("character_count"),
    characterNames: varchar("character_names").array()
  }
).existing();

/*
-- (Re)Create RAID_ATTENDEE_MAP
CREATE SCHEMA IF NOT EXISTS "views"
;
DROP VIEW IF EXISTS views.raid_attendee_map
;
CREATE OR REPLACE VIEW views.raid_attendee_map AS
SELECT
  rl.raid_id AS raid_id
  , COALESCE(c.primary_character_id, c.character_id) as primary_character_id
  , COUNT(DISTINCT c.name) as character_count
  , ARRAY_AGG(DISTINCT c.name) as character_names
FROM public.raid_log rl
LEFT JOIN public.raid_log_attendee_map rlam ON rl.raid_log_id = rlam.raid_log_id
LEFT JOIN public.character c ON c.character_id = rlam.character_id
WHERE rl.raid_id IS NOT NULL
GROUP BY rl.raid_id, COALESCE(c.primary_character_id, c.character_id)
;
*/