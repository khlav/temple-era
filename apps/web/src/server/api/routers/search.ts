import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  raids,
  characters,
  raidLogs,
  raidLogAttendeeMap,
} from "~/server/db/schema";
import { ilike, or, sql, eq, and, not } from "drizzle-orm";

// Helper function to parse search terms with OR logic and grouped negative terms
function parseSearchTerms(query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const positiveTerms: string[] = [];
  const negativeTerms: string[] = [];

  for (const term of terms) {
    if (term.startsWith("-")) {
      // Handle grouped negative terms like -(ashkandi windseeker)
      if (term.startsWith("-(") && term.endsWith(")")) {
        const groupContent = term.slice(2, -1);
        const groupTerms = groupContent.split(/\s+/).filter(Boolean);
        negativeTerms.push(...groupTerms);
      } else {
        negativeTerms.push(term.slice(1));
      }
    } else {
      // Handle OR terms with pipe separator like warrior|mage
      if (term.includes("|")) {
        const orTerms = term.split("|").filter(Boolean);
        // For OR terms, we need to create a special structure
        positiveTerms.push(`OR:${orTerms.join("|")}`);
      } else {
        positiveTerms.push(term);
      }
    }
  }

  return { positiveTerms, negativeTerms };
}

// Helper function to build raid search conditions
function buildRaidSearchConditions(
  positiveTerms: string[],
  negativeTerms: string[],
) {
  const conditions = [];

  // Build searchable text that includes name, zone, month, day, date formats, and zone acronyms
  const searchableText = sql`CONCAT(
    COALESCE(${raids.name}, ''),
    ' ',
    COALESCE(${raids.zone}, ''),
    ' ',
    TO_CHAR(${raids.date}, 'Month'),
    ' ',
    TO_CHAR(${raids.date}, 'Mon'),
    ' ',
    TO_CHAR(${raids.date}, 'MM'),
    ' ',
    TO_CHAR(${raids.date}, 'Day'),
    ' ',
    TO_CHAR(${raids.date}, 'Dy'),
    ' ',
    TO_CHAR(${raids.date}, 'YYYY'),
    ' ',
    TO_CHAR(${raids.date}, 'YYYY-MM-DD'),
    ' ',
    TO_CHAR(${raids.date}, 'MM-DD'),
    ' ',
    TO_CHAR(${raids.date}, 'DD'),
    ' ',
    CASE 
      WHEN ${raids.zone} = 'Molten Core' THEN 'MC'
      WHEN ${raids.zone} = 'Blackwing Lair' THEN 'BWL'
      WHEN ${raids.zone} = 'Naxxramas' THEN 'Naxx'
      WHEN ${raids.zone} = 'Temple of Ahn''Qiraj' THEN 'AQ40 AQ'
      WHEN ${raids.zone} = 'Ruins of Ahn''Qiraj' THEN 'AQ20 AQ'
      WHEN ${raids.zone} = 'Zul''Gurub' THEN 'ZG'
      WHEN ${raids.zone} = 'Onyxia' THEN 'Ony'
      ELSE ''
    END
  )`;

  // Add positive term conditions (AND logic across terms, OR logic within terms)
  for (const term of positiveTerms) {
    if (term.startsWith("OR:")) {
      // Handle OR terms like "OR:warrior|mage"
      const orTerms = term.slice(3).split("|").filter(Boolean);
      const orConditions = orTerms.map((orTerm) =>
        ilike(searchableText, `%${orTerm}%`),
      );
      conditions.push(or(...orConditions));
    } else {
      conditions.push(ilike(searchableText, `%${term}%`));
    }
  }

  // Add negative term conditions (NOT logic)
  for (const term of negativeTerms) {
    conditions.push(not(ilike(searchableText, `%${term}%`)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// Helper function to build character search conditions
function buildCharacterSearchConditions(
  positiveTerms: string[],
  negativeTerms: string[],
) {
  const conditions = [];

  // Build searchable text for characters
  const searchableText = sql`CONCAT(
    COALESCE(${characters.name}, ''),
    ' ',
    COALESCE(${characters.class}, ''),
    ' ',
    COALESCE(${characters.server}, ''),
    ' ',
    COALESCE((
      SELECT pc.name 
      FROM character AS pc 
      WHERE pc.character_id = ${characters.primaryCharacterId}
    ), '')
  )`;

  // Add positive term conditions (AND logic across terms, OR logic within terms)
  for (const term of positiveTerms) {
    if (term.startsWith("OR:")) {
      // Handle OR terms like "OR:warrior|mage"
      const orTerms = term.slice(3).split("|").filter(Boolean);
      const orConditions = orTerms.map((orTerm) =>
        ilike(searchableText, `%${orTerm}%`),
      );
      conditions.push(or(...orConditions));
    } else {
      conditions.push(ilike(searchableText, `%${term}%`));
    }
  }

  // Add negative term conditions (NOT logic)
  for (const term of negativeTerms) {
    conditions.push(not(ilike(searchableText, `%${term}%`)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const searchRouter = createTRPCRouter({
  global: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const { positiveTerms, negativeTerms } = parseSearchTerms(input.query);

      // If no positive terms, return empty results
      if (positiveTerms.length === 0 && negativeTerms.length === 0) {
        return { raids: [], characters: [] };
      }

      // Build search conditions for raids
      const raidSearchConditions = buildRaidSearchConditions(
        positiveTerms,
        negativeTerms,
      );

      // Search raids (fetch 51 to check if there are more results)
      const allRaidResults = await db
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
        .where(raidSearchConditions)
        .groupBy(raids.raidId, raids.name, raids.zone, raids.date)
        .orderBy(sql`${raids.date} DESC`)
        .limit(51);

      const raidResults = allRaidResults.slice(0, 50);
      const raidsHasMore = allRaidResults.length > 50;

      // Build search conditions for characters
      const characterSearchConditions = buildCharacterSearchConditions(
        positiveTerms,
        negativeTerms,
      );

      // Search characters with last raid attended date (fetch 51 to check if there are more results)
      // Include primary character name in search
      const allCharacterResults = await db
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
        .where(characterSearchConditions)
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
        .limit(51);

      const characterResults = allCharacterResults.slice(0, 50);
      const charactersHasMore = allCharacterResults.length > 50;

      return {
        raids: raidResults,
        characters: characterResults,
        hasMore: raidsHasMore || charactersHasMore,
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
