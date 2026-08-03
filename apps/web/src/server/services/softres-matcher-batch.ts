/**
 * Batch version of SoftRes character matching and stats gathering
 * Processes multiple characters at once to reduce database queries
 */

import { sql, eq, and, inArray, or } from "drizzle-orm";
import type { db } from "~/server/db";
import {
  characters,
  raidLogAttendeeMap,
  raidBenchMap,
  raids,
  raidLogs,
  primaryRaidAttendanceL6LockoutWk,
} from "~/server/db/schema";
import type { RaidZone } from "~/lib/raid-zones";
import type { SoftResReservedCharacter } from "~/server/api/interfaces/softres";

/**
 * Statistics for a matched character
 */
export interface MatchedCharacterStats {
  characterId: number;
  characterName: string;
  characterClass: string;
  primaryCharacterId: number | null;
  primaryCharacterName: string | null;
  totalRaidsAttendedBenched: number;
  zoneRaidsAttended: number; // attended only (no bench)
  zoneRaidsAttendedBenched: number; // attended + benched
  primaryAttendancePct: number | null;
}

/**
 * Match multiple SoftRes characters to database characters in batch
 * Returns a map of SoftRes character name -> matched characterId (or null)
 */
export async function matchCharactersBatch(
  database: typeof db,
  softresChars: SoftResReservedCharacter[],
): Promise<Map<string, number | null>> {
  if (softresChars.length === 0) {
    return new Map();
  }

  const names = softresChars.map((c) => c.name);

  // Broad candidate fetch: any character whose name is diacritic-equivalent
  // (via Postgres's unaccent) to any SoftRes reservation name.
  const nameConditions = names.map(
    (name) => sql`LOWER(f_unaccent(${characters.name})) = LOWER(f_unaccent(${name}))`,
  );

  const allMatches = await database
    .select({
      characterId: characters.characterId,
      name: characters.name,
      class: characters.class,
      primaryCharacterId: characters.primaryCharacterId,
      normalizedName: sql<string>`LOWER(f_unaccent(${characters.name}))`,
    })
    .from(characters)
    .where(and(or(...nameConditions), eq(characters.isIgnored, false)));

  // Normalize the incoming SoftRes names through the same unaccent() Postgres
  // just used for the candidate query, in one round trip. A JS-side
  // reimplementation (e.g. NFD decomposition) diverges on stroke letters like
  // ø/ł — those aren't "combining" accents under Unicode, so NFD leaves them
  // untouched while unaccent() correctly maps them to o/l. Re-deriving the key
  // in JS silently dropped otherwise-correct SQL matches.
  const namesArrayLiteral = sql.join(
    names.map((name) => sql`${name}`),
    sql.raw(", "),
  );
  const normalizedSoftresRows = await database.execute<{
    original: string;
    normalized: string;
  }>(
    sql`SELECT name AS original, LOWER(f_unaccent(name)) AS normalized
        FROM unnest(ARRAY[${namesArrayLiteral}]::text[]) AS name`,
  );
  const normalizedByOriginal = new Map(
    normalizedSoftresRows.map((r) => [r.original, r.normalized]),
  );

  const candidatesByNormalizedName = new Map<string, typeof allMatches>();
  for (const match of allMatches) {
    const bucket = candidatesByNormalizedName.get(match.normalizedName) ?? [];
    bucket.push(match);
    candidatesByNormalizedName.set(match.normalizedName, bucket);
  }

  // Match each SoftRes character to a database character with a priority
  // waterfall: an exact (literal) name match wins outright, since it's the
  // strongest possible signal; otherwise fall back to a diacritic-free name
  // match, preferring a same-class candidate before matching on name alone.
  const result = new Map<string, number | null>();

  for (const softresChar of softresChars) {
    const normalizedName = normalizedByOriginal.get(softresChar.name);
    const candidates = normalizedName ? (candidatesByNormalizedName.get(normalizedName) ?? []) : [];

    if (candidates.length === 0) {
      result.set(softresChar.name, null);
      continue;
    }

    // Tier 1: exact name match
    const exactMatches = candidates.filter((c) => c.name === softresChar.name);
    if (exactMatches.length > 0) {
      exactMatches.sort((a, b) => a.name.localeCompare(b.name));
      result.set(softresChar.name, exactMatches[0]!.characterId);
      continue;
    }

    // Tier 2: diacritic-free name + class match, falling back to
    // Tier 3: diacritic-free name only
    const classMatches = candidates.filter(
      (c) => c.class.toLowerCase() === softresChar.class.toLowerCase(),
    );
    const finalCandidates = classMatches.length > 0 ? classMatches : candidates;

    finalCandidates.sort((a, b) => a.name.localeCompare(b.name));
    result.set(softresChar.name, finalCandidates[0]?.characterId ?? null);
  }

  return result;
}

/**
 * Get attendance statistics for multiple characters in batch
 * Returns a map of characterId -> stats
 * If zone is null, zone-specific stats will be 0
 */
export async function getCharacterStatsBatch(
  database: typeof db,
  characterIds: number[],
  zone: RaidZone | null,
): Promise<Map<number, MatchedCharacterStats>> {
  if (characterIds.length === 0) {
    return new Map();
  }

  // Query 1: Get all character info with primary characters
  const characterInfos = await database.query.characters.findMany({
    where: inArray(characters.characterId, characterIds),
    columns: {
      characterId: true,
      name: true,
      class: true,
      primaryCharacterId: true,
    },
    with: {
      primaryCharacter: {
        columns: {
          characterId: true,
          name: true,
        },
      },
    },
  });

  // Create map for quick lookup
  const characterMap = new Map(characterInfos.map((c) => [c.characterId, c]));

  // Query 2: Get total attendee raids for all characters
  const totalAttendeeRaids = await database
    .select({
      characterId: raidLogAttendeeMap.characterId,
      uniqueRaidCount: sql<number>`COUNT(DISTINCT ${raids.raidId})`,
    })
    .from(raidLogAttendeeMap)
    .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
    .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
    .where(
      and(
        inArray(raidLogAttendeeMap.characterId, characterIds),
        eq(raidLogAttendeeMap.isIgnored, false),
      ),
    )
    .groupBy(raidLogAttendeeMap.characterId);

  // Query 3: Get total bench raids for all characters
  const totalBenchRaids = await database
    .select({
      characterId: raidBenchMap.characterId,
      uniqueRaidCount: sql<number>`COUNT(DISTINCT ${raids.raidId})`,
    })
    .from(raidBenchMap)
    .innerJoin(raids, eq(raidBenchMap.raidId, raids.raidId))
    .where(inArray(raidBenchMap.characterId, characterIds))
    .groupBy(raidBenchMap.characterId);

  // Query 4: Get zone attendee raids for all characters (skip if zone is null)
  const zoneAttendeeRaids = zone
    ? await database
        .select({
          characterId: raidLogAttendeeMap.characterId,
          uniqueRaidCount: sql<number>`COUNT(DISTINCT ${raids.raidId})`,
        })
        .from(raidLogAttendeeMap)
        .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
        .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
        .where(
          and(
            inArray(raidLogAttendeeMap.characterId, characterIds),
            eq(raidLogAttendeeMap.isIgnored, false),
            eq(raids.zone, zone),
          ),
        )
        .groupBy(raidLogAttendeeMap.characterId)
    : [];

  // Query 5: Get zone bench raids for all characters (skip if zone is null)
  const zoneBenchRaids = zone
    ? await database
        .select({
          characterId: raidBenchMap.characterId,
          uniqueRaidCount: sql<number>`COUNT(DISTINCT ${raids.raidId})`,
        })
        .from(raidBenchMap)
        .innerJoin(raids, eq(raidBenchMap.raidId, raids.raidId))
        .where(and(inArray(raidBenchMap.characterId, characterIds), eq(raids.zone, zone)))
        .groupBy(raidBenchMap.characterId)
    : [];

  // Query 6: Get primary attendance percentages for all primary character IDs
  const primaryCharacterIds = Array.from(
    new Set(characterInfos.map((c) => c.primaryCharacterId ?? c.characterId)),
  );

  const primaryAttendances = await database
    .select({
      characterId: primaryRaidAttendanceL6LockoutWk.characterId,
      weightedAttendancePct: primaryRaidAttendanceL6LockoutWk.weightedAttendancePct,
    })
    .from(primaryRaidAttendanceL6LockoutWk)
    .where(inArray(primaryRaidAttendanceL6LockoutWk.characterId, primaryCharacterIds));

  // Create maps for quick lookup
  const totalAttendeeMap = new Map(
    totalAttendeeRaids.map((r) => [r.characterId, r.uniqueRaidCount]),
  );
  const totalBenchMap = new Map(totalBenchRaids.map((r) => [r.characterId, r.uniqueRaidCount]));
  const zoneAttendeeMap = new Map(zoneAttendeeRaids.map((r) => [r.characterId, r.uniqueRaidCount]));
  const zoneBenchMap = new Map(zoneBenchRaids.map((r) => [r.characterId, r.uniqueRaidCount]));
  const primaryAttendanceMap = new Map(
    primaryAttendances.map((r) => [r.characterId, r.weightedAttendancePct]),
  );

  // Build result map
  const result = new Map<number, MatchedCharacterStats>();

  for (const characterId of characterIds) {
    const character = characterMap.get(characterId);
    if (!character) {
      continue; // Skip if character not found
    }

    // Use primaryCharacterId if it exists, otherwise fall back to characterId
    const primaryCharacterId = character.primaryCharacterId ?? character.characterId;

    result.set(characterId, {
      characterId: character.characterId,
      characterName: character.name,
      characterClass: character.class,
      primaryCharacterId: character.primaryCharacterId,
      primaryCharacterName: character.primaryCharacter?.name ?? null,
      totalRaidsAttendedBenched:
        Number(totalAttendeeMap.get(characterId) ?? 0) +
        Number(totalBenchMap.get(characterId) ?? 0),
      zoneRaidsAttended: Number(zoneAttendeeMap.get(characterId) ?? 0),
      zoneRaidsAttendedBenched:
        Number(zoneAttendeeMap.get(characterId) ?? 0) + Number(zoneBenchMap.get(characterId) ?? 0),
      // Look up attendance using the coalesced primaryCharacterId (primaryCharacterId ?? characterId)
      primaryAttendancePct: primaryAttendanceMap.get(primaryCharacterId) ?? null,
    });
  }

  return result;
}
