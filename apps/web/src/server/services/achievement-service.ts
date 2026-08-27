import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  achievements,
  achievementTiers,
  achievementAwards,
  seasons,
  users,
} from "~/server/db/schema";

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

export interface CreateSeasonInput {
  name: string;
  startDate: Date;
  endDate?: Date | null;
}

/** Minimal season creation so a season-scoped custom achievement has something to reference —
 *  Season 2's real dates are seeded here once known (see docs/ideation/achievement-engine); the
 *  rule engine (Phase 2) never creates seasons itself, only reads them. */
export async function createSeason(input: CreateSeasonInput, actingUserId: string) {
  const [season] = await db
    .insert(seasons)
    .values({
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      createdById: actingUserId,
    })
    .returning();
  return season!;
}

export async function listSeasons() {
  return db.query.seasons.findMany({ orderBy: (season, { desc }) => [desc(season.startDate)] });
}

export interface CreateAchievementInput {
  name: string;
  description?: string | null;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  scope: "season" | "all_time";
  seasonId?: string | null;
  hidden: boolean;
}

/** Defines one achievement + exactly one tier, no rule attached (`ruleShape`/`ruleConfig` stay
 *  null) — step 1 of the two-step manual admin flow. An officer wanting the same conceptual
 *  award at a second tier for a different recipient calls this again; there is no cross-tier
 *  linkage for manual achievements. */
export async function createAchievement(input: CreateAchievementInput, actingUserId: string) {
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
      hidden: input.hidden,
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
