import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, scopedProcedure } from "~/server/api/trpc";
import { SCOPE } from "~/lib/scopes";
import {
  AchievementServiceError,
  createAchievement,
  grantAchievement,
  markAchievementAwardsSeen,
  resolveSessionPrimaryCharacterId,
  listAchievements,
  listAwardsForFamily,
  createSeason,
  listSeasons,
} from "~/server/services/achievement-service";
import {
  getUnseenAwards,
  getDisplayCatalog,
  getAwardById,
} from "~/server/services/achievement-queries";

const achievementTierLevelSchema = z.enum(["bronze", "silver", "gold", "platinum"]);
const achievementScopeSchema = z.enum(["season", "all_time"]);

function toTRPCError(error: unknown): never {
  if (error instanceof AchievementServiceError) {
    const code =
      error.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "INVALID"
          ? "BAD_REQUEST"
          : "CONFLICT";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

export const achievementRouter = createTRPCRouter({
  // Step 1 of the two-step manual admin flow: define a custom award (name, icon, tier,
  // season|all-time scope, hidden flag), no rule attached.
  createAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(
      z.object({
        name: z.string().trim().min(1).max(128),
        description: z.string().max(512).nullable().optional(),
        icon: z.string().trim().min(1).max(128),
        tier: achievementTierLevelSchema,
        scope: achievementScopeSchema,
        seasonId: z.string().uuid().nullable().optional(),
        hidden: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createAchievement(input, ctx.session.user.id);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Step 2: grant an existing manual (non-rule) tier to a family — repeatable across families
  // over time, each grant its own achievement_award row.
  grantAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(z.object({ achievementTierId: z.string().uuid(), primaryCharacterId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await grantAchievement(input, ctx.session.user.id);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Not scope-gated — any authenticated user marks their own family's awards seen (e.g. after
  // dismissing the reveal overlay in a later phase).
  markSeen: protectedProcedure
    .input(z.object({ achievementAwardIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const callerPrimaryCharacterId = await resolveSessionPrimaryCharacterId(ctx.session.user.id);
      if (callerPrimaryCharacterId === null) {
        return { updated: 0 };
      }
      return markAchievementAwardsSeen(input.achievementAwardIds, callerPrimaryCharacterId);
    }),

  createSeason: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(
      z.object({
        name: z.string().trim().min(1).max(128),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createSeason(input, ctx.session.user.id);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  listSeasons: protectedProcedure.query(() => listSeasons()),

  listAchievements: protectedProcedure.query(() => listAchievements()),

  listAwardsForFamily: protectedProcedure
    .input(z.object({ primaryCharacterId: z.number().int() }))
    .query(({ input }) => listAwardsForFamily(input.primaryCharacterId)),

  // Backs the FAB badge count and the reveal overlay's hero+strip batch — always the caller's
  // own family, never another character's.
  getUnseenAwards: protectedProcedure.query(async ({ ctx }) => {
    const primaryCharacterId = await resolveSessionPrimaryCharacterId(ctx.session.user.id);
    if (primaryCharacterId === null) return [];
    return getUnseenAwards(ctx.db, primaryCharacterId);
  }),

  // Backs achievement-display.tsx on both the character page (any viewed character's family) and
  // the Trophy Case (the caller's own family) — takes an explicit primaryCharacterId rather than
  // always resolving the caller's own, since the character page needs to show whichever
  // character is being viewed.
  getDisplayCatalog: protectedProcedure
    .input(z.object({ primaryCharacterId: z.number().int() }))
    .query(({ ctx, input }) => getDisplayCatalog(ctx.db, input.primaryCharacterId)),

  // Backs Trophy Case replay — works regardless of seenAt, unlike getUnseenAwards.
  getAwardById: protectedProcedure
    .input(z.object({ achievementAwardId: z.string().uuid() }))
    .query(({ ctx, input }) => getAwardById(ctx.db, input.achievementAwardId)),
});
