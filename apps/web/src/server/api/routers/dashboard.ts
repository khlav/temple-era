// import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import {primaryRaidAttendanceL6LockoutWk, trackedRaidsL6LockoutWk} from "~/server/db/schema";

export const dashboard = createTRPCRouter({
  getTrackedRaidsL6LockoutWk: publicProcedure
    .query(async ({ ctx }) => {
    const raids = await ctx.db
      .select({
        name: trackedRaidsL6LockoutWk.name,
        raidId: trackedRaidsL6LockoutWk.raidId,
        date: trackedRaidsL6LockoutWk.date,
        attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
        zone: trackedRaidsL6LockoutWk.zone
      })
      .from(trackedRaidsL6LockoutWk)
    return raids ?? [];
  }),

  getPrimaryRaidAttendanceL6LockoutWk: publicProcedure
    .query(async ({ ctx }) => {
      const raids = await ctx.db
        .select()
        .from(primaryRaidAttendanceL6LockoutWk)
      return raids ?? [];
    }),

});
