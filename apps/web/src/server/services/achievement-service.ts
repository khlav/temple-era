import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  achievements,
  achievementTiers,
  achievementAwards,
  seasons,
  users,
} from "~/server/db/schema";
import { isValidIconName } from "~/server/services/wow-icon-catalog";

/**
 * `achievement` router and this service are the only two places award rows get written outside
 * the rule engine (Phase 2's `evaluateAchievementsForFamily`, which uses these same tables
 * directly rather than going through this module). Codes mirror `WorldBuffServiceError`'s shape.
 */
export class AchievementServiceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "AchievementServiceError";
  }
}

// Unwraps drizzle-orm's `DrizzleQueryError` to the driver's `PostgresError` underneath, same
// helper as world-buff-service.ts — see that file for why `.cause` has to be checked first.
function getPgErrorCode(error: unknown): string | undefined {
  for (const candidate of [(error as { cause?: unknown } | undefined)?.cause, error]) {
    if (candidate && typeof candidate === "object" && "code" in candidate) {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

export async function listSeasons() {
  return db.query.seasons.findMany({ orderBy: (season, { desc }) => [desc(season.startDate)] });
}

export interface CreateAchievementInput {
  name: string;
  description?: string | null;
  icon: string;
  tier: "copper" | "silver" | "gold" | "thorium" | "arcanite";
  scope: "season" | "all_time";
  seasonId?: string | null;
}

/** Defines one achievement + exactly one tier, no rule attached (`ruleShape`/`ruleConfig` stay
 *  null) — step 1 of the two-step manual admin flow. An officer wanting the same conceptual
 *  award at a second tier for a different recipient calls this again; there is no cross-tier
 *  linkage for manual achievements. Always hidden — a custom achievement is by definition a
 *  surprise/manual grant, not something that belongs in the always-visible Core/Classes catalog,
 *  so there's no admin choice here (unlike a rule-based achievement, which can be either). */
export async function createAchievement(input: CreateAchievementInput, actingUserId: string) {
  if (!isValidIconName(input.icon)) {
    throw new AchievementServiceError("INVALID", "Unknown icon name");
  }

  if (input.scope === "season" && !input.seasonId) {
    throw new AchievementServiceError("INVALID", "seasonId is required when scope is 'season'");
  }

  if (input.seasonId) {
    const season = await db.query.seasons.findFirst({ where: eq(seasons.id, input.seasonId) });
    if (!season) {
      throw new AchievementServiceError("NOT_FOUND", "Season not found");
    }
  }

  const [achievement] = await db
    .insert(achievements)
    .values({
      name: input.name,
      description: input.description ?? null,
      icon: input.icon,
      scope: input.scope,
      seasonId: input.scope === "season" ? input.seasonId : null,
      ruleShape: null,
      hidden: true,
      createdById: actingUserId,
    })
    .returning();

  const [tier] = await db
    .insert(achievementTiers)
    .values({
      achievementId: achievement!.id,
      tier: input.tier,
      ruleConfig: null,
    })
    .returning();

  return { achievementId: achievement!.id, achievementTierId: tier!.id };
}

export interface UpdateAchievementInput {
  name: string;
  description?: string | null;
  icon: string;
  tier: "copper" | "silver" | "gold" | "thorium" | "arcanite";
  scope: "season" | "all_time";
  seasonId?: string | null;
}

/** Edits an existing custom (manual-grant-only) achievement in place — name/description/icon/
 *  scope/season, plus its single tier's level. Rule-based achievements (ruleShape non-null) are
 *  part of the code catalog (achievement-definitions.ts) and can't be edited here — doing so
 *  would silently diverge the DB row from what the next seedAchievementDefinitions run would
 *  produce. Existing awards are untouched: they still point at the same achievementTierId, so a
 *  family already holding this tier keeps holding it (just under whatever it's renamed to),
 *  without losing awardedAt/source the way revoke-then-regrant would. */
export async function updateAchievement(achievementId: string, input: UpdateAchievementInput) {
  const achievement = await db.query.achievements.findFirst({
    where: eq(achievements.id, achievementId),
    with: { tiers: { columns: { id: true } } },
  });
  if (!achievement) {
    throw new AchievementServiceError("NOT_FOUND", "Achievement not found");
  }
  if (achievement.ruleShape !== null) {
    throw new AchievementServiceError(
      "INVALID",
      "Only custom (manual-grant) achievements can be edited",
    );
  }
  if (achievement.tiers.length !== 1) {
    throw new AchievementServiceError(
      "INVALID",
      "Expected exactly one tier for a custom achievement",
    );
  }

  if (!isValidIconName(input.icon)) {
    throw new AchievementServiceError("INVALID", "Unknown icon name");
  }

  if (input.scope === "season" && !input.seasonId) {
    throw new AchievementServiceError("INVALID", "seasonId is required when scope is 'season'");
  }
  if (input.seasonId) {
    const season = await db.query.seasons.findFirst({ where: eq(seasons.id, input.seasonId) });
    if (!season) {
      throw new AchievementServiceError("NOT_FOUND", "Season not found");
    }
  }

  await db
    .update(achievements)
    .set({
      name: input.name,
      description: input.description ?? null,
      icon: input.icon,
      scope: input.scope,
      seasonId: input.scope === "season" ? input.seasonId : null,
    })
    .where(eq(achievements.id, achievementId));

  const [tierId] = achievement.tiers;
  await db
    .update(achievementTiers)
    .set({ tier: input.tier })
    .where(eq(achievementTiers.id, tierId!.id));

  return { achievementId, achievementTierId: tierId!.id };
}

export interface GrantAchievementInput {
  achievementTierId: string;
  primaryCharacterId: number;
}

/** Step 2 of the two-step manual admin flow: grants an existing manual (non-rule) tier to a
 *  family, repeatable across families over time. Each grant is its own permanent
 *  `achievement_award` row. */
export async function grantAchievement(input: GrantAchievementInput, actingUserId: string) {
  const tier = await db.query.achievementTiers.findFirst({
    where: eq(achievementTiers.id, input.achievementTierId),
  });
  if (!tier) {
    throw new AchievementServiceError("NOT_FOUND", "Achievement tier not found");
  }
  if (tier.ruleConfig !== null) {
    throw new AchievementServiceError(
      "CONFLICT",
      "This tier is rule-managed and cannot be granted manually",
    );
  }

  try {
    const [award] = await db
      .insert(achievementAwards)
      .values({
        achievementTierId: input.achievementTierId,
        primaryCharacterId: input.primaryCharacterId,
        source: "manual",
        awardedByUserId: actingUserId,
      })
      .returning();
    return { achievementAwardId: award!.id };
  } catch (error) {
    // Unique violation on (achievementTierId, primaryCharacterId) — this family already holds
    // this exact tier. Unlike the rule engine's idempotent re-evaluation, a human clicking
    // "grant" twice is more likely a mistake worth surfacing rather than silently no-op'ing.
    if (getPgErrorCode(error) === "23505") {
      throw new AchievementServiceError(
        "CONFLICT",
        "This family has already been awarded this achievement tier",
      );
    }
    throw error;
  }
}

export interface GrantCustomAchievementInput {
  achievementId: string;
  primaryCharacterId: number;
}

/** Convenience wrapper over grantAchievement for callers (the v1 REST API) that only know an
 *  achievementId, not the underlying achievementTierId — every custom achievement has exactly
 *  one tier (see createAchievement), so this resolves it automatically. Rejects rule-based
 *  achievements the same way updateAchievement/deleteAchievement do: those can carry multiple
 *  tiers, and there'd be no single tier to resolve an achievementId-only call to. */
export async function grantCustomAchievement(
  input: GrantCustomAchievementInput,
  actingUserId: string,
) {
  const achievement = await db.query.achievements.findFirst({
    where: eq(achievements.id, input.achievementId),
    with: { tiers: { columns: { id: true } } },
  });
  if (!achievement) {
    throw new AchievementServiceError("NOT_FOUND", "Achievement not found");
  }
  if (achievement.ruleShape !== null || achievement.tiers.length !== 1) {
    throw new AchievementServiceError(
      "INVALID",
      "Only custom (manual-grant) achievements can be granted by achievementId",
    );
  }

  return grantAchievement(
    { achievementTierId: achievement.tiers[0]!.id, primaryCharacterId: input.primaryCharacterId },
    actingUserId,
  );
}

/** Hard-deletes EVERY tier a family holds for one achievement, not just the tier `achievementAwardId`
 *  points at — the admin panel only ever shows a holder once, under their highest earned tier (see
 *  getAdminCatalog), so "revoke" there means "this family shouldn't hold this achievement at all,"
 *  not "downgrade them one tier." A family that crossed copper/silver/gold all has three separate
 *  award rows (the rule engine awards every tier independently as it's crossed); leaving the lower
 *  ones behind after revoking gold would just resurface the family under silver on the next load.
 *  Works on ANY award regardless of `source`: a rule-engine mis-crossing is just as real a mistake
 *  to undo as a manual one. Unlike a manual award, though, a revoked rule-sourced one has no durable
 *  "don't re-grant" marker — the unique index that used to block a duplicate is gone the moment
 *  these rows are, so the next evaluation that finds the family still crossing a threshold will
 *  legitimately re-insert it. The admin panel surfaces this rather than pretending revoke is
 *  permanent for a rule award. */
export async function revokeAward(achievementAwardId: string) {
  const award = await db.query.achievementAwards.findFirst({
    where: eq(achievementAwards.id, achievementAwardId),
    columns: { primaryCharacterId: true },
    with: { achievementTier: { columns: { achievementId: true } } },
  });
  if (!award) {
    throw new AchievementServiceError("NOT_FOUND", "Achievement award not found");
  }

  const siblingTiers = await db.query.achievementTiers.findMany({
    where: eq(achievementTiers.achievementId, award.achievementTier.achievementId),
    columns: { id: true },
  });

  const deleted = await db
    .delete(achievementAwards)
    .where(
      and(
        eq(achievementAwards.primaryCharacterId, award.primaryCharacterId),
        inArray(
          achievementAwards.achievementTierId,
          siblingTiers.map((t) => t.id),
        ),
      ),
    )
    .returning({ id: achievementAwards.id });
  return { revokedAwardIds: deleted.map((d) => d.id) };
}

/** Hard-deletes a custom achievement's definition entirely — every award any family holds for
 *  it, its tier, and the achievement row itself (the tier row cascades automatically via its FK
 *  to `achievement`; awards don't, so they're deleted explicitly first). Unlike revokeAward
 *  (which only ever removes one family's grants), this removes the achievement from the catalog
 *  altogether — it can't be granted again without recreating it from scratch. Rule-based
 *  achievements can't be deleted here: they're part of the code catalog and would just reappear,
 *  confusingly gapped, on the next seedAchievementDefinitions reseed. */
export async function deleteAchievement(achievementId: string) {
  const achievement = await db.query.achievements.findFirst({
    where: eq(achievements.id, achievementId),
    with: { tiers: { columns: { id: true } } },
  });
  if (!achievement) {
    throw new AchievementServiceError("NOT_FOUND", "Achievement not found");
  }
  if (achievement.ruleShape !== null) {
    throw new AchievementServiceError(
      "INVALID",
      "Only custom (manual-grant) achievements can be deleted",
    );
  }

  const tierIds = achievement.tiers.map((t) => t.id);
  const deletedAwards = tierIds.length
    ? await db
        .delete(achievementAwards)
        .where(inArray(achievementAwards.achievementTierId, tierIds))
        .returning({ id: achievementAwards.id })
    : [];

  await db.delete(achievements).where(eq(achievements.id, achievementId));

  return { deletedAwardCount: deletedAwards.length };
}

/** Resolves the calling session's own family (primary character id) via the same
 *  character -> primaryCharacter join `profile.ts`'s `getMyProfile` uses — self is primary when
 *  `primaryCharacterId` is null, matching `characters.isPrimary`'s generated-column semantics. */
export async function resolveSessionPrimaryCharacterId(userId: string): Promise<number | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {},
    with: {
      character: {
        columns: { characterId: true, primaryCharacterId: true },
      },
    },
  });
  if (!user?.character) return null;
  return user.character.primaryCharacterId ?? user.character.characterId;
}

/** Marks `seenAt` on every achievement_award row passed in that belongs to the caller's own
 *  family — non-matching ids are silently excluded, not an error, since a stale client array
 *  shouldn't fail the whole call. Idempotent: re-marking an already-seen row is a no-op update. */
export async function markAchievementAwardsSeen(
  achievementAwardIds: string[],
  callerPrimaryCharacterId: number,
) {
  const updated = await db
    .update(achievementAwards)
    .set({ seenAt: new Date() })
    .where(
      and(
        inArray(achievementAwards.id, achievementAwardIds),
        eq(achievementAwards.primaryCharacterId, callerPrimaryCharacterId),
      ),
    )
    .returning({ id: achievementAwards.id });
  return { updated: updated.length };
}

/** Read model backing both the admin grant UI and the (future) display components — every
 *  achievement with its tiers, newest achievement first. */
export async function listAchievements() {
  return db.query.achievements.findMany({
    with: { tiers: true, season: true },
    orderBy: (achievement, { desc }) => [desc(achievement.createdAt)],
  });
}

/** All awards for one family, tier + achievement joined in. */
export async function listAwardsForFamily(primaryCharacterId: number) {
  return db.query.achievementAwards.findMany({
    where: eq(achievementAwards.primaryCharacterId, primaryCharacterId),
    with: { achievementTier: { with: { achievement: true } } },
    orderBy: (award, { desc }) => [desc(award.awardedAt)],
  });
}
