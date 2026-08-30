import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  scopedProcedure,
} from "~/server/api/trpc";
import { SCOPE } from "~/lib/scopes";
import {
  AchievementServiceError,
  createAchievement,
  updateAchievement,
  deleteAchievement,
  grantAchievement,
  revokeAward,
  markAchievementAwardsSeen,
  resolveSessionPrimaryCharacterId,
  listAchievements,
  listAwardsForFamily,
  listSeasons,
} from "~/server/services/achievement-service";
import {
  getUnseenAwards,
  getAllAwards,
  getDisplayCatalog,
  getPublicCatalog,
  getAwardById,
  getAdminCatalog,
} from "~/server/services/achievement-queries";
import { getRandomIconNames, searchIconNames } from "~/server/services/wow-icon-catalog";

const achievementTierLevelSchema = z.enum(["copper", "silver", "gold", "thorium", "arcanite"]);
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
  // season|all-time scope), no rule attached. Always hidden — see createAchievement's own doc
  // comment — so there's no `hidden` field here for a caller to set.
  createAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(
      z.object({
        name: z.string().trim().min(1).max(128),
        description: z.string().max(512).nullable().optional(),
        icon: z.string().trim().min(1).max(128),
        tier: achievementTierLevelSchema,
        scope: achievementScopeSchema,
        seasonId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createAchievement(input, ctx.session.user.id);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Edits a custom achievement in place (name/description/icon/scope/season/tier level). Only
  // custom achievements — rule-based ones live in achievement-definitions.ts and reject here.
  updateAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(
      z.object({
        achievementId: z.string().uuid(),
        name: z.string().trim().min(1).max(128),
        description: z.string().max(512).nullable().optional(),
        icon: z.string().trim().min(1).max(128),
        tier: achievementTierLevelSchema,
        scope: achievementScopeSchema,
        seasonId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { achievementId, ...rest } = input;
        return await updateAchievement(achievementId, rest);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Hard-deletes a custom achievement and every award for it — see deleteAchievement's own doc
  // comment for why rule-based achievements reject here instead of silently no-op'ing.
  deleteAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(z.object({ achievementId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        return await deleteAchievement(input.achievementId);
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

  // Revokes any award (rule- or manually-sourced) — the admin panel's correction tool for a
  // mistaken grant. See revokeAward's own doc comment for why a revoked rule-sourced award isn't
  // durably suppressed.
  revokeAward: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(z.object({ achievementAwardId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        return await revokeAward(input.achievementAwardId);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Every achievement/tier/holder in one shot — backs the Manage Achievements catalog table.
  getAdminCatalog: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE).query(({ ctx }) =>
    getAdminCatalog(ctx.db),
  ),

  // Backs the custom-achievement form's icon picker (sample grid + Randomize) — the ~23,500-name
  // list itself never leaves the server; this hands back only the small random slice requested.
  getRandomIcons: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(z.object({ count: z.number().int().min(1).max(50) }))
    .query(({ input }) => getRandomIconNames(input.count)),

  // Backs the icon picker's type-ahead dropdown (3+ typed characters, up to 50 matches).
  searchIcons: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(z.object({ q: z.string().trim().min(1).max(64) }))
    .query(({ input }) => searchIconNames(input.q, 50)),

  listSeasons: protectedProcedure.query(() => listSeasons()),

  // Public (logged-out) — backs the "{Season name} Achievements" header + period on the
  // Achievements page and the character page's Achievements card. Season name/dates aren't
  // sensitive; listSeasons is already ordered newest-first, so the current season is just its
  // first row.
  getCurrentSeason: publicProcedure.query(async () => {
    const seasons = await listSeasons();
    return seasons[0] ?? null;
  }),

  // Scoped, not merely protected: this returns EVERY achievement including hidden ("Legendary
  // Feats") ones — name, description, icon, and per-tier ruleConfig — unfiltered. Every earned-
  // achievement-aware display path (getDisplayCatalog, getPublicCatalog) deliberately excludes
  // unearned hidden achievements at the query level so their existence never reaches a client
  // that hasn't earned them; a plain protectedProcedure here would let any signed-in guild member
  // read the full secret catalog before earning anything, bypassing that design entirely.
  listAchievements: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE).query(() => listAchievements()),

  // Always the caller's own family, same privacy boundary as getUnseenAwards/getAllAwards —
  // seenAt, awardedByUserId, and source are private per-account state, so this must not take an
  // arbitrary primaryCharacterId the way getPublicCatalog does for the public character page.
  listAwardsForFamily: protectedProcedure.query(async ({ ctx }) => {
    const primaryCharacterId = await resolveSessionPrimaryCharacterId(ctx.session.user.id);
    if (primaryCharacterId === null) return [];
    return listAwardsForFamily(primaryCharacterId);
  }),

  // Backs the FAB badge count and the reveal overlay's hero+strip batch — always the caller's
  // own family, never another character's.
  getUnseenAwards: protectedProcedure.query(async ({ ctx }) => {
    const primaryCharacterId = await resolveSessionPrimaryCharacterId(ctx.session.user.id);
    if (primaryCharacterId === null) return [];
    return getUnseenAwards(ctx.db, primaryCharacterId);
  }),

  // Dev-only: backs RevealFab's `?revealDebug=1` harness (every award, seenAt ignored) so the
  // full hero+strip ceremony can be replayed on demand while iterating on the animation — see
  // getAllAwards's own doc comment. Not gated server-side (it only ever returns the caller's own
  // family's data, same privacy boundary as getUnseenAwards), but nothing in production UI calls
  // it — RevealFab only queries it behind a NODE_ENV === "development" check.
  getAllAwards: protectedProcedure.query(async ({ ctx }) => {
    const primaryCharacterId = await resolveSessionPrimaryCharacterId(ctx.session.user.id);
    if (primaryCharacterId === null) return [];
    return getAllAwards(ctx.db, primaryCharacterId);
  }),

  // Backs achievement-display.tsx on both the character page (any viewed character's family) and
  // the Achievements page (the caller's own family) — takes an explicit primaryCharacterId rather than
  // always resolving the caller's own, since the character page needs to show whichever
  // character is being viewed. Public, not protected: the character page itself is visible
  // signed-out (character-detail.tsx always passes the viewed character's real id, never null,
  // regardless of whether the visitor has a session), and this never reads ctx.session — a
  // logged-out visitor browsing a character page should see that character's real earned
  // achievements, not an UNAUTHORIZED error. getPublicCatalog below is a different case: no
  // specific character in view, so it falls back to "everything unearned" instead.
  getDisplayCatalog: publicProcedure
    .input(z.object({ primaryCharacterId: z.number().int() }))
    .query(({ ctx, input }) => getDisplayCatalog(ctx.db, input.primaryCharacterId)),

  // Public (logged-out) equivalent of getDisplayCatalog — the same visible catalog with
  // everything unearned, so a signed-out visitor to /achievements sees the full board instead of
  // a blank gate. No award data for any real family is ever touched by this path.
  getPublicCatalog: publicProcedure.query(({ ctx }) => getPublicCatalog(ctx.db)),

  // Backs both pages' chip-click replay (achievement-display.tsx's onReplay) — works regardless
  // of seenAt, unlike getUnseenAwards. Public, not protected, for the same reason as
  // getDisplayCatalog above: a signed-out visitor on a character page now legitimately sees real
  // earned chips (via getDisplayCatalog), and clicking one to replay must not throw just because
  // there's no session — this never reads ctx.session, only an opaque award id.
  getAwardById: publicProcedure
    .input(z.object({ achievementAwardId: z.string().uuid() }))
    .query(({ ctx, input }) => getAwardById(ctx.db, input.achievementAwardId)),
});
