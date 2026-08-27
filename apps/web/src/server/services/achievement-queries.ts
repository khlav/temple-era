import { and, eq, inArray, isNull } from "drizzle-orm";
import { type db as database } from "~/server/db";
import { achievements, achievementAwards } from "~/server/db/schema";
import {
  getHighestTierPerAchievement,
  getNextTierProgress,
} from "~/server/services/achievement-rules";

type DB = typeof database;
type AchievementTierLevel = "bronze" | "silver" | "gold" | "platinum";
const TIER_RANK: Record<AchievementTierLevel, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};

export interface UnseenAward {
  achievementAwardId: string;
  achievementId: string;
  name: string;
  icon: string;
  tier: AchievementTierLevel;
  awardedAt: Date;
}

/** Backs the FAB badge count and the reveal overlay's hero+strip batch — ordered rarest-tier-
 *  first, most-recently-awarded breaking ties, matching the reveal overlay's own pickHero (kept
 *  in both places since the overlay must also render correctly given an unsorted array, e.g. from
 *  Trophy Case replay of a single award). `db` is injected (matching achievement-rules.ts's DI
 *  convention) so tests can pass a lightweight fake directly instead of module-mocking. */
export async function getUnseenAwards(db: DB, primaryCharacterId: number): Promise<UnseenAward[]> {
  const rows = await db.query.achievementAwards.findMany({
    where: and(
      eq(achievementAwards.primaryCharacterId, primaryCharacterId),
      isNull(achievementAwards.seenAt),
    ),
    with: { achievementTier: { with: { achievement: true } } },
  });
  return rows
    .map((row) => ({
      achievementAwardId: row.id,
      achievementId: row.achievementTier.achievementId,
      name: row.achievementTier.achievement.name,
      icon: row.achievementTier.achievement.icon,
      tier: row.achievementTier.tier as AchievementTierLevel,
      awardedAt: row.awardedAt,
    }))
    .sort((a, b) => {
      const r = TIER_RANK[b.tier] - TIER_RANK[a.tier];
      if (r !== 0) return r;
      return b.awardedAt.getTime() - a.awardedAt.getTime();
    });
}

/** Backs Trophy Case replay — works regardless of `seenAt`, unlike getUnseenAwards. */
export async function getAwardById(
  db: DB,
  achievementAwardId: string,
): Promise<UnseenAward | null> {
  const row = await db.query.achievementAwards.findFirst({
    where: eq(achievementAwards.id, achievementAwardId),
    with: { achievementTier: { with: { achievement: true } } },
  });
  if (!row) return null;
  return {
    achievementAwardId: row.id,
    achievementId: row.achievementTier.achievementId,
    name: row.achievementTier.achievement.name,
    icon: row.achievementTier.achievement.icon,
    tier: row.achievementTier.tier as AchievementTierLevel,
    awardedAt: row.awardedAt,
  };
}

export interface DisplayAchievement {
  achievementId: string;
  name: string;
  icon: string;
  highestTierEarned: AchievementTierLevel | null;
  progress: { nextTier: AchievementTierLevel; current: number; target: number } | null;
}

export interface DisplayCatalog {
  visible: DisplayAchievement[];
  hiddenEarned: DisplayAchievement[];
}

/** Backs achievement-display.tsx (character page + Trophy Case). A hidden achievement with no
 *  award for this family is excluded by the query itself (the `hidden`/`IN` filter below), never
 *  fetched into application code and filtered client-side — see spec-phase-3.md's Risks:
 *  client-side filtering would leak the achievement's existence over the network. */
export async function getDisplayCatalog(
  db: DB,
  primaryCharacterId: number,
): Promise<DisplayCatalog> {
  const highestTiers = await getHighestTierPerAchievement(db, primaryCharacterId);
  const earnedAchievementIds = [...highestTiers.keys()];

  const [visibleDefs, hiddenEarned] = await Promise.all([
    db.query.achievements.findMany({ where: eq(achievements.hidden, false) }),
    // Filtered in the query itself (WHERE hidden = true AND id IN (this family's earned ids)) —
    // never fetches an unearned hidden achievement's name/icon into application code at all,
    // rather than fetching-then-discarding, so there's nothing to accidentally leak downstream.
    earnedAchievementIds.length > 0
      ? db.query.achievements.findMany({
          where: and(eq(achievements.hidden, true), inArray(achievements.id, earnedAchievementIds)),
        })
      : Promise.resolve([]),
  ]);

  const toDisplay = async (
    achievement: (typeof visibleDefs)[number],
    includeProgress: boolean,
  ): Promise<DisplayAchievement> => {
    const highestTierEarned = highestTiers.get(achievement.id) ?? null;
    const rawProgress = includeProgress
      ? await getNextTierProgress(db, primaryCharacterId, achievement.id, new Date())
      : null;
    const progress = rawProgress
      ? {
          nextTier: rawProgress.nextTier,
          current: rawProgress.progress.current,
          target: rawProgress.progress.target,
        }
      : null;
    return {
      achievementId: achievement.id,
      name: achievement.name,
      icon: achievement.icon,
      highestTierEarned,
      progress,
    };
  };

  const visible = await Promise.all(visibleDefs.map((a) => toDisplay(a, true)));
  // Hidden achievements never show progress, even after being earned — a hidden achievement's
  // next tier is itself part of the surprise (contract's explicit design).
  const hiddenEarnedDisplay = await Promise.all(hiddenEarned.map((a) => toDisplay(a, false)));

  return { visible, hiddenEarned: hiddenEarnedDisplay };
}
