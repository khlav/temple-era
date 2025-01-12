// import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  primaryRaidAttendanceL6LockoutWk,
  raidLogs,
  trackedRaidsL6LockoutWk,
} from "~/server/db/schema";
import {desc, eq, sql} from "drizzle-orm";

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

  getPrimaryRaidAttendanceL6LockoutWk: publicProcedure.query(
    async ({ ctx }) => {
      const raids = await ctx.db
        .select()
        .from(primaryRaidAttendanceL6LockoutWk);
      return raids ?? [];
    },
  ),
});
