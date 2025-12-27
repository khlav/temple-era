import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  primaryRaidAttendanceL6LockoutWk,
  raidLogs,
  reportDates,
  trackedRaidsCurrentLockout,
  trackedRaidsL6LockoutWk,
  allRaidsCurrentLockout,
} from "~/server/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { primaryRaidAttendeeAndBenchMap } from "~/server/db/models/views-schema";

export const dashboard = createTRPCRouter({
  getTrackedRaidsL6LockoutWk: publicProcedure.query(async ({ ctx }) => {
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
          eq(
            trackedRaidsL6LockoutWk.raidId,
            primaryRaidAttendeeAndBenchMap.raidId,
          ),
          eq(
            primaryRaidAttendeeAndBenchMap.primaryCharacterId,
            ctx.session?.user.characterId ?? -1,
          ),
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
    return raids ?? [];
  }),

  getTrackedRaidsCurrentLockout: publicProcedure.query(async ({ ctx }) => {
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
      .leftJoin(
        raidLogs,
        eq(raidLogs.raidId, trackedRaidsCurrentLockout.raidId),
      )
      .leftJoin(
        primaryRaidAttendeeAndBenchMap,
        and(
          eq(
            trackedRaidsCurrentLockout.raidId,
            primaryRaidAttendeeAndBenchMap.raidId,
          ),
          eq(
            primaryRaidAttendeeAndBenchMap.primaryCharacterId,
            ctx.session?.user.characterId ?? -1,
          ),
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
          eq(
            allRaidsCurrentLockout.raidId,
            primaryRaidAttendeeAndBenchMap.raidId,
          ),
          eq(
            primaryRaidAttendeeAndBenchMap.primaryCharacterId,
            ctx.session?.user.characterId ?? -1,
          ),
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
    return raids ?? [];
  }),

  getPrimaryRaidAttendanceL6LockoutWk: publicProcedure.query(
    async ({ ctx }) => {
      const raids = await ctx.db
        .select()
        .from(primaryRaidAttendanceL6LockoutWk);
      return raids ?? [];
    },
  ),

  getReportDates: publicProcedure.query(async ({ ctx }) => {
    return (await ctx.db.select().from(reportDates))[0];
  }),

  getPersonalAttendanceHeatmap: publicProcedure.query(async ({ ctx }) => {
    const characterId = ctx.session?.user.characterId;
    if (!characterId) {
      return { weeks: [] };
    }

    // Get report dates to determine the 6 lockout weeks
    const reportDatesResult = await ctx.db.select().from(reportDates).limit(1);
    const reportPeriodStart = reportDatesResult[0]?.reportPeriodStart;

    // Calculate the 6 lockout weeks (Tuesday to Monday)
    // Each lockout week starts on Tuesday
    const lockoutWeeks: string[] = [];
    if (reportPeriodStart) {
      const startDate = new Date(reportPeriodStart);

      // Calculate Tuesday of the first week
      const firstTuesday = new Date(startDate);
      firstTuesday.setUTCDate(firstTuesday.getUTCDate() - 1);
      const dayOfWeek = firstTuesday.getUTCDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      firstTuesday.setUTCDate(firstTuesday.getUTCDate() - daysToMonday);
      firstTuesday.setUTCDate(firstTuesday.getUTCDate() + 1); // Now it's Tuesday

      // Generate 6 weeks starting from the first Tuesday
      for (let i = 0; i < 6; i++) {
        const weekStart = new Date(firstTuesday);
        weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
        lockoutWeeks.push(weekStart.toISOString().split("T")[0] ?? "");
      }
    }

    // Get all tracked raids from last 6 lockout weeks with user's attendance
    const raids = await ctx.db
      .select({
        raidId: trackedRaidsL6LockoutWk.raidId,
        name: trackedRaidsL6LockoutWk.name,
        date: trackedRaidsL6LockoutWk.date,
        zone: trackedRaidsL6LockoutWk.zone,
        attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
        lockoutWeek: trackedRaidsL6LockoutWk.lockoutWeek,
        attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
        allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
      })
      .from(trackedRaidsL6LockoutWk)
      .leftJoin(
        primaryRaidAttendeeAndBenchMap,
        and(
          eq(
            trackedRaidsL6LockoutWk.raidId,
            primaryRaidAttendeeAndBenchMap.raidId,
          ),
          eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
        ),
      )
      .where(sql`${trackedRaidsL6LockoutWk.attendanceWeight} > 0`)
      .orderBy(
        trackedRaidsL6LockoutWk.lockoutWeek,
        desc(trackedRaidsL6LockoutWk.date),
      );

    // Filter to only include raids where user attended/benched
    const filteredRaids = raids.filter((raid) => raid.attendeeOrBench !== null);

    // Initialize weekMap with all 6 lockout weeks
    const weekMap = new Map<
      string,
      {
        weekStart: string;
        zones: {
          naxxramas?: {
            attended: boolean;
            attendanceWeight: number;
            raids: Array<{
              name: string;
              status: "attendee" | "bench";
              characterNames: string[];
            }>;
          };
          aq40?: {
            attended: boolean;
            attendanceWeight: number;
            raids: Array<{
              name: string;
              status: "attendee" | "bench";
              characterNames: string[];
            }>;
          };
          bwl?: {
            attended: boolean;
            attendanceWeight: number;
            raids: Array<{
              name: string;
              status: "attendee" | "bench";
              characterNames: string[];
            }>;
          };
          mc?: {
            attended: boolean;
            attendanceWeight: number;
            raids: Array<{
              name: string;
              status: "attendee" | "bench";
              characterNames: string[];
            }>;
            isGrayed: boolean;
          };
        };
      }
    >();

    // Initialize all 6 weeks with empty zones
    for (const weekStart of lockoutWeeks) {
      weekMap.set(weekStart, {
        weekStart,
        zones: {},
      });
    }

    // Populate with attendance data
    for (const raid of filteredRaids) {
      if (!raid.lockoutWeek || !raid.attendeeOrBench) continue;

      const weekKey = raid.lockoutWeek;
      if (!weekMap.has(weekKey)) {
        // Skip if week is not in our 6-week range
        continue;
      }

      const week = weekMap.get(weekKey)!;
      const zone = raid.zone ?? "";
      const status = raid.attendeeOrBench === "attendee" ? "attendee" : "bench";
      const characterNames =
        raid.allCharacters?.map((char) => char.name).filter(Boolean) ?? [];

      // Zones are stored as full names: "Naxxramas", "Temple of Ahn'Qiraj", "Blackwing Lair", "Molten Core"
      if (zone === "Naxxramas") {
        if (!week.zones.naxxramas) {
          week.zones.naxxramas = {
            attended: true,
            attendanceWeight: raid.attendanceWeight ?? 0,
            raids: [],
          };
        }
        week.zones.naxxramas.raids.push({
          name: raid.name ?? "",
          status,
          characterNames,
        });
      } else if (zone === "Temple of Ahn'Qiraj") {
        if (!week.zones.aq40) {
          week.zones.aq40 = {
            attended: true,
            attendanceWeight: raid.attendanceWeight ?? 0,
            raids: [],
          };
        }
        week.zones.aq40.raids.push({
          name: raid.name ?? "",
          status,
          characterNames,
        });
      } else if (zone === "Blackwing Lair") {
        if (!week.zones.bwl) {
          week.zones.bwl = {
            attended: true,
            attendanceWeight: raid.attendanceWeight ?? 0,
            raids: [],
          };
        }
        week.zones.bwl.raids.push({
          name: raid.name ?? "",
          status,
          characterNames,
        });
      } else if (zone === "Molten Core") {
        if (!week.zones.mc) {
          week.zones.mc = {
            attended: true,
            attendanceWeight: raid.attendanceWeight ?? 0,
            raids: [],
            isGrayed: false,
          };
        }
        week.zones.mc.raids.push({
          name: raid.name ?? "",
          status,
          characterNames,
        });
      }
    }

    // Check for MC graying (if Naxx + AQ40 + BWL all attended in same week)
    for (const week of weekMap.values()) {
      const hasNaxx = !!week.zones.naxxramas;
      const hasAQ40 = !!week.zones.aq40;
      const hasBWL = !!week.zones.bwl;

      if (week.zones.mc && hasNaxx && hasAQ40 && hasBWL) {
        week.zones.mc.isGrayed = true;
      }
    }

    // Convert to array and sort by weekStart (oldest first)
    const weeks = Array.from(weekMap.values()).sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );

    return { weeks };
  }),
});
