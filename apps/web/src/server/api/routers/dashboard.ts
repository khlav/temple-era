import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  primaryRaidAttendanceL6LockoutWk,
  raidLogs,
  reportDates, trackedRaidsCurrentLockout,
  trackedRaidsL6LockoutWk,
  allRaidsCurrentLockout
} from "~/server/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const dashboard = createTRPCRouter({
  getTrackedRaidsL6LockoutWk: publicProcedure.query(async ({ ctx }) => {
    const raids = await ctx.db
      .select({
        name: trackedRaidsL6LockoutWk.name,
        raidId: trackedRaidsL6LockoutWk.raidId,
        date: trackedRaidsL6LockoutWk.date,
        attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
        zone: trackedRaidsL6LockoutWk.zone,
        raidLogIds: sql<string[]>`array_agg
            (${raidLogs.raidLogId})`,
      })
      .from(trackedRaidsL6LockoutWk)
      .leftJoin(raidLogs, eq(raidLogs.raidId, trackedRaidsL6LockoutWk.raidId))
      .groupBy((trackedRaidsL6LockoutWk) => [
        trackedRaidsL6LockoutWk.name,
        trackedRaidsL6LockoutWk.raidId,
        trackedRaidsL6LockoutWk.date,
        trackedRaidsL6LockoutWk.attendanceWeight,
        trackedRaidsL6LockoutWk.zone,
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
        raidLogIds: sql<string[]>`array_agg
            (${raidLogs.raidLogId})`,
      })
      .from(trackedRaidsCurrentLockout)
      .leftJoin(raidLogs, eq(raidLogs.raidId, trackedRaidsCurrentLockout.raidId))
      .groupBy((trackedRaidsL6LockoutWk) => [
        trackedRaidsL6LockoutWk.name,
        trackedRaidsL6LockoutWk.raidId,
        trackedRaidsL6LockoutWk.date,
        trackedRaidsL6LockoutWk.attendanceWeight,
        trackedRaidsL6LockoutWk.zone,
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
        raidLogIds: sql<string[]>`array_agg
            (${raidLogs.raidLogId})`,
      })
      .from(allRaidsCurrentLockout)
      .leftJoin(raidLogs, eq(raidLogs.raidId, allRaidsCurrentLockout.raidId))
      .groupBy((allRaidsCurrentLockout) => [
        allRaidsCurrentLockout.name,
        allRaidsCurrentLockout.raidId,
        allRaidsCurrentLockout.date,
        allRaidsCurrentLockout.attendanceWeight,
        allRaidsCurrentLockout.zone,
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
});
