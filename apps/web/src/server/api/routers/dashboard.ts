import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  characters,
  raidLogs,
  reportDates,
  trackedRaidsCurrentLockout,
  trackedRaidsL6LockoutWk,
  allRaidsCurrentLockout,
} from "~/server/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { primaryRaidAttendeeAndBenchMap } from "~/server/db/models/views-schema";
import type { db as Db } from "~/server/db";

interface BaseRaidRow {
  raidId: number;
  [key: string]: unknown;
}

/** Which specific family member was credited for each raid (usually one, but a family can
 *  occasionally log more than one member the same night) — fetched as a direct, unjoined lookup
 *  against the view rather than folded into the caller's own query, since `allCharacters` is a
 *  JSON column that can't sit in a GROUP BY without an aggregate wrapper, and a plain WHERE here
 *  sidesteps the raidLogs fan-out that necessitates that GROUP BY at all. Shared by every
 *  dashboard raids-list query so the "Attended by" column reads the same everywhere. */
async function attachAttendedCharacter<T extends BaseRaidRow>(
  db: typeof Db,
  raids: T[],
  characterId: number,
): Promise<
  (T & { attendedCharacterName: string | null; attendedCharacterClass: string | null })[]
> {
  const raidIds = raids.map((r) => r.raidId);
  const attendedByRaidId = new Map<number, { name: string; characterId: number } | null>();
  if (raidIds.length > 0 && characterId !== -1) {
    const attendanceRows = await db
      .select({
        raidId: primaryRaidAttendeeAndBenchMap.raidId,
        allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
      })
      .from(primaryRaidAttendeeAndBenchMap)
      .where(
        and(
          inArray(primaryRaidAttendeeAndBenchMap.raidId, raidIds),
          eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
        ),
      );
    for (const row of attendanceRows) {
      if (row.raidId != null) attendedByRaidId.set(row.raidId, row.allCharacters?.[0] ?? null);
    }
  }

  const attendedCharacterIds = Array.from(
    new Set(Array.from(attendedByRaidId.values()).flatMap((c) => (c ? [c.characterId] : []))),
  );
  const classById = new Map<number, string>();
  if (attendedCharacterIds.length > 0) {
    const characterRows = await db
      .select({ characterId: characters.characterId, class: characters.class })
      .from(characters)
      .where(inArray(characters.characterId, attendedCharacterIds));
    for (const row of characterRows) classById.set(row.characterId, row.class);
  }

  return raids.map((r) => {
    const attended = attendedByRaidId.get(r.raidId) ?? null;
    return {
      ...r,
      attendedCharacterName: attended?.name ?? null,
      attendedCharacterClass: attended ? (classById.get(attended.characterId) ?? null) : null,
    };
  });
}

export const dashboard = createTRPCRouter({
  getTrackedRaidsL6LockoutWk: publicProcedure.query(async ({ ctx }) => {
    const session = await ctx.getSession();
    const characterId = session?.user.characterId ?? -1;

    const raids = await ctx.db
      .select({
        name: trackedRaidsL6LockoutWk.name,
        raidId: trackedRaidsL6LockoutWk.raidId,
        date: trackedRaidsL6LockoutWk.date,
        attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
        zone: trackedRaidsL6LockoutWk.zone,
        currentUserAttendance: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
        raidLogIds: sql<string[]>`array_agg
            (${raidLogs.raidLogId})`,
      })
      .from(trackedRaidsL6LockoutWk)
      .leftJoin(raidLogs, eq(raidLogs.raidId, trackedRaidsL6LockoutWk.raidId))
      .leftJoin(
        primaryRaidAttendeeAndBenchMap,
        and(
          eq(trackedRaidsL6LockoutWk.raidId, primaryRaidAttendeeAndBenchMap.raidId),
          eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
        ),
      )
      .groupBy((trackedRaidsL6LockoutWk) => [
        trackedRaidsL6LockoutWk.name,
        trackedRaidsL6LockoutWk.raidId,
        trackedRaidsL6LockoutWk.date,
        trackedRaidsL6LockoutWk.attendanceWeight,
        trackedRaidsL6LockoutWk.zone,
        primaryRaidAttendeeAndBenchMap.attendeeOrBench,
      ])
      .orderBy(desc(trackedRaidsL6LockoutWk.date));

    return attachAttendedCharacter(ctx.db, raids, characterId);
  }),

  getTrackedRaidsCurrentLockout: publicProcedure.query(async ({ ctx }) => {
    const session = await ctx.getSession();

    const raids = await ctx.db
      .select({
        name: trackedRaidsCurrentLockout.name,
        raidId: trackedRaidsCurrentLockout.raidId,
        date: trackedRaidsCurrentLockout.date,
        attendanceWeight: trackedRaidsCurrentLockout.attendanceWeight,
        zone: trackedRaidsCurrentLockout.zone,
        currentUserAttendance: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
        raidLogIds: sql<string[]>`array_agg
            (${raidLogs.raidLogId})`,
      })
      .from(trackedRaidsCurrentLockout)
      .leftJoin(raidLogs, eq(raidLogs.raidId, trackedRaidsCurrentLockout.raidId))
      .leftJoin(
        primaryRaidAttendeeAndBenchMap,
        and(
          eq(trackedRaidsCurrentLockout.raidId, primaryRaidAttendeeAndBenchMap.raidId),
          eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, session?.user.characterId ?? -1),
        ),
      )
      .groupBy((trackedRaidsL6LockoutWk) => [
        trackedRaidsL6LockoutWk.name,
        trackedRaidsL6LockoutWk.raidId,
        trackedRaidsL6LockoutWk.date,
        trackedRaidsL6LockoutWk.attendanceWeight,
        trackedRaidsL6LockoutWk.zone,
        primaryRaidAttendeeAndBenchMap.attendeeOrBench,
      ])
      .orderBy(desc(trackedRaidsCurrentLockout.date));
    return raids ?? [];
  }),

  getAllRaidsCurrentLockout: publicProcedure.query(async ({ ctx }) => {
    const session = await ctx.getSession();
    const characterId = session?.user.characterId ?? -1;

    const raids = await ctx.db
      .select({
        name: allRaidsCurrentLockout.name,
        raidId: allRaidsCurrentLockout.raidId,
        date: allRaidsCurrentLockout.date,
        attendanceWeight: allRaidsCurrentLockout.attendanceWeight,
        zone: allRaidsCurrentLockout.zone,
        currentUserAttendance: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
        raidLogIds: sql<string[]>`array_agg
            (${raidLogs.raidLogId})`,
      })
      .from(allRaidsCurrentLockout)
      .leftJoin(raidLogs, eq(raidLogs.raidId, allRaidsCurrentLockout.raidId))
      .leftJoin(
        primaryRaidAttendeeAndBenchMap,
        and(
          eq(allRaidsCurrentLockout.raidId, primaryRaidAttendeeAndBenchMap.raidId),
          eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
        ),
      )
      .groupBy((allRaidsCurrentLockout) => [
        allRaidsCurrentLockout.name,
        allRaidsCurrentLockout.raidId,
        allRaidsCurrentLockout.date,
        allRaidsCurrentLockout.attendanceWeight,
        allRaidsCurrentLockout.zone,
        primaryRaidAttendeeAndBenchMap.attendeeOrBench,
      ])
      .orderBy(desc(allRaidsCurrentLockout.date));

    return attachAttendedCharacter(ctx.db, raids, characterId);
  }),

  getReportDates: publicProcedure.query(async ({ ctx }) => {
    return (await ctx.db.select().from(reportDates))[0];
  }),
});
