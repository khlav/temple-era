import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  raids,
  characters,
  raidLogs,
  raidLogAttendeeMap,
} from "~/server/db/schema";
import { ilike, or, sql, eq } from "drizzle-orm";

export const searchRouter = createTRPCRouter({
  global: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const searchTerm = `%${input.query}%`;

      // Search raids (limit 10)
      const raidResults = await db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          zone: raids.zone,
          date: raids.date,
          killCount: sql<number>`COALESCE(SUM(${raidLogs.killCount}), 0)`.as(
            "killCount",
          ),
        })
        .from(raids)
        .leftJoin(raidLogs, eq(raids.raidId, raidLogs.raidId))
        .where(or(ilike(raids.name, searchTerm), ilike(raids.zone, searchTerm)))
        .groupBy(raids.raidId, raids.name, raids.zone, raids.date)
        .orderBy(sql`${raids.date} DESC`)
        .limit(10);

      // Search characters with last raid attended date (limit 10)
      // Include primary character name in search
      const characterResults = await db
        .select({
          characterId: characters.characterId,
          name: characters.name,
          class: characters.class,
          server: characters.server,
          lastRaidDate: sql<string>`max(${raids.date})`.as("lastRaidDate"),
          primaryCharacterName: sql<string>`(
                    SELECT pc.name 
                    FROM character AS pc 
                    WHERE pc.character_id = ${characters.primaryCharacterId}
                  )`.as("primaryCharacterName"),
        })
        .from(characters)
        .leftJoin(
          raidLogAttendeeMap,
          eq(characters.characterId, raidLogAttendeeMap.characterId),
        )
        .leftJoin(
          raidLogs,
          eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId),
        )
        .leftJoin(raids, eq(raidLogs.raidId, raids.raidId))
        .where(
          or(
            ilike(characters.name, searchTerm),
            ilike(characters.class, searchTerm),
            sql`EXISTS (
                      SELECT 1 FROM character AS pc 
                      WHERE pc.character_id = ${characters.primaryCharacterId} 
                      AND pc.name ILIKE ${searchTerm}
                    )`,
          ),
        )
        .groupBy(
          characters.characterId,
          characters.name,
          characters.class,
          characters.server,
        )
        .orderBy(
          sql`CASE WHEN ${characters.primaryCharacterId} IS NULL THEN 0 ELSE 1 END`,
          sql`max(${raids.date}) DESC NULLS LAST`,
        )
        .limit(10);

      return {
        raids: raidResults,
        characters: characterResults,
      };
    }),

  // Debug endpoint to check if there's any data
  debug: publicProcedure.query(async () => {
    const totalRaids = await db
      .select({ count: sql<number>`count(*)` })
      .from(raids);
    const totalCharacters = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters);

    const sampleRaids = await db.select().from(raids).limit(3);
    const sampleCharacters = await db.select().from(characters).limit(3);

    return {
      totalRaids: totalRaids[0]?.count || 0,
      totalCharacters: totalCharacters[0]?.count || 0,
      sampleRaids,
      sampleCharacters,
    };
  }),
});
