// import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import {raidAttendanceL6lockoutwk, trackedRaidsL6lockoutwk} from "~/server/db/schema";

export const dashboard = createTRPCRouter({
  getTrackedRaidsL6LockoutWk: publicProcedure
    .query(async ({ ctx }) => {
    const raids = await ctx.db
      .select()
      .from(trackedRaidsL6lockoutwk)
    return raids ?? [];
  }),

  getRaidAttendanceL6LockoutWk: publicProcedure
    .query(async ({ ctx }) => {
      const raids = await ctx.db
        .select()
        .from(raidAttendanceL6lockoutwk)
      return raids ?? [];
    }),

});
