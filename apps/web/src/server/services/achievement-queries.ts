import { and, eq, inArray, isNull } from "drizzle-orm";
import { type db as database } from "~/server/db";
import { achievements, achievementAwards, type AchievementRuleConfig } from "~/server/db/schema";
import { resolveAchievementDescription } from "~/server/services/achievement-description";

type DB = typeof database;
type AchievementTierLevel = "copper" | "silver" | "gold" | "thorium" | "arcanite";
const TIER_RANK: Record<AchievementTierLevel, number> = {
  copper: 0,
  silver: 1,
  gold: 2,
  thorium: 3,
  arcanite: 4,
};

export interface UnseenAward {
  achievementAwardId: string;
  achievementId: string;
  name: string;
  icon: string;
  tier: AchievementTierLevel;
  awardedAt: Date;
  /** Resolved against this specific tier's ruleConfig — see resolveAchievementDescription. "" when
   *  the achievement has no description template. */
  description: string;
}

// Shared by every query below that walks achievementAwards -> achievementTier -> achievement —
// a plain duck-typed shape (rather than deriving from a specific `with`-clause query's inferred
// return type) since Drizzle's relational query builder overloads its return type per `with`
// shape, which doesn't factor out cleanly across the differently-shaped queries below.
interface AwardRow {
  id: string;
  awardedAt: Date;
  achievementTier: {
    achievementId: string;
    tier: string;
    ruleConfig: AchievementRuleConfig | null;
    achievement: {
      name: string;
      icon: string;
      description: string | null;
      scope: "season" | "all_time";
    };
  };
}

function toUnseenAward(row: AwardRow): UnseenAward {
  return {
    achievementAwardId: row.id,
    achievementId: row.achievementTier.achievementId,
    name: row.achievementTier.achievement.name,
    icon: row.achievementTier.achievement.icon,
    tier: row.achievementTier.tier as AchievementTierLevel,
    awardedAt: row.awardedAt,
    description: resolveAchievementDescription(
      row.achievementTier.achievement.description,
      row.achievementTier.ruleConfig,
      row.achievementTier.achievement.scope,
    ),
  };
}

function byRarestThenNewest(a: UnseenAward, b: UnseenAward): number {
  const r = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (r !== 0) return r;
  return b.awardedAt.getTime() - a.awardedAt.getTime();
}

/** Backs the FAB badge count and the reveal overlay's hero+strip batch — ordered rarest-tier-
 *  first, most-recently-awarded breaking ties, matching the reveal overlay's own pickHero (kept
 *  in both places since the overlay must also render correctly given an unsorted array, e.g. from
 *  the Achievements page's replay of a single award). `db` is injected (matching achievement-rules.ts's DI
 *  convention) so tests can pass a lightweight fake directly instead of module-mocking. */
export async function getUnseenAwards(db: DB, primaryCharacterId: number): Promise<UnseenAward[]> {
  const rows = await db.query.achievementAwards.findMany({
    where: and(
      eq(achievementAwards.primaryCharacterId, primaryCharacterId),
      isNull(achievementAwards.seenAt),
    ),
    with: { achievementTier: { with: { achievement: true } } },
  });
  return rows.map(toUnseenAward).sort(byRarestThenNewest);
}

/** Every award ever crossed by this family, `seenAt` ignored entirely — backs the dev-only reveal
 *  debug harness (`?revealDebug=1` on RevealFab) so the full hero+strip ceremony can be replayed
 *  on demand while iterating on the animation, without mutating real seen-state or being limited
 *  to the Achievements page's one-award-at-a-time replay. Not otherwise wired to any production surface. */
export async function getAllAwards(db: DB, primaryCharacterId: number): Promise<UnseenAward[]> {
  const rows = await db.query.achievementAwards.findMany({
    where: eq(achievementAwards.primaryCharacterId, primaryCharacterId),
    with: { achievementTier: { with: { achievement: true } } },
  });
  return rows.map(toUnseenAward).sort(byRarestThenNewest);
}

/** Backs the Achievements page's replay — works regardless of `seenAt`, unlike getUnseenAwards. */
export async function getAwardById(
  db: DB,
  achievementAwardId: string,
): Promise<UnseenAward | null> {
  const row = await db.query.achievementAwards.findFirst({
    where: eq(achievementAwards.id, achievementAwardId),
    with: { achievementTier: { with: { achievement: true } } },
  });
  if (!row) return null;
  return toUnseenAward(row);
}

export interface DisplayAchievement {
  achievementId: string;
  name: string;
  icon: string;
  /** Resolved against the highest earned tier's ruleConfig (or "" if unearned/no template) — see
   *  resolveAchievementDescription. */
  description: string;
  /** The tier one above `highestTierEarned`, when one exists — null when unearned, hidden, or
   *  already at the achievement's max tier. Tooltip-only, paired with nextTierDescription. */
  nextTier: AchievementTierLevel | null;
  /** Resolved against nextTier's ruleConfig — null exactly when nextTier is null. Tooltip-only:
   *  a "For {nextTier}:" label followed by this text, below `description`. */
  nextTierDescription: string | null;
  scope: "season" | "all_time";
  /** Drives achievement-display.tsx's Season/Classes split — every class-attendance achievement
   *  uses this one shape and nothing else does, so it doubles as that section's membership test. */
  ruleShape: string | null;
  /** The WoW class a class-attendance achievement is keyed to (from its own ruleConfig, not the
   *  achievement's flavor name) — null for every other shape. Sorts the Classes section. */
  wowClass: string | null;
  highestTierEarned: AchievementTierLevel | null;
  /** The award backing `highestTierEarned` — lets the card itself replay that reveal (getAwardById)
   *  without a separate award list. Null whenever highestTierEarned is null. */
  achievementAwardId: string | null;
  progress: { nextTier: AchievementTierLevel; current: number; target: number } | null;
}

export interface DisplayCatalog {
  visible: DisplayAchievement[];
  hiddenEarned: DisplayAchievement[];
}

interface HighestAward {
  tier: AchievementTierLevel;
  achievementAwardId: string;
}

// Local, richer sibling of achievement-rules.ts's getHighestTierPerAchievement — this file needs
// the specific award id too (so a display card can replay its own reveal), which that shared
// utility doesn't carry and whose other caller (the rule engine) has no use for.
async function getHighestAwardPerAchievement(
  db: DB,
  primaryCharacterId: number,
): Promise<Map<string, HighestAward>> {
  const rows = await db.query.achievementAwards.findMany({
    where: eq(achievementAwards.primaryCharacterId, primaryCharacterId),
    with: { achievementTier: true },
  });
  const highest = new Map<string, HighestAward>();
  for (const row of rows) {
    const achievementId = row.achievementTier.achievementId;
    const tier = row.achievementTier.tier as AchievementTierLevel;
    const current = highest.get(achievementId);
    if (!current || TIER_RANK[tier] > TIER_RANK[current.tier]) {
      highest.set(achievementId, { tier, achievementAwardId: row.id });
    }
  }
  return highest;
}

/** Backs achievement-display.tsx (character page + Achievements page). A hidden achievement with no
 *  award for this family is excluded by the query itself (the `hidden`/`IN` filter below), never
 *  fetched into application code and filtered client-side — see spec-phase-3.md's Risks:
 *  client-side filtering would leak the achievement's existence over the network. */
export async function getDisplayCatalog(
  db: DB,
  primaryCharacterId: number,
): Promise<DisplayCatalog> {
  const highestAwards = await getHighestAwardPerAchievement(db, primaryCharacterId);
  return buildDisplayCatalog(db, highestAwards);
}

/** Backs the Achievements page's logged-out state — same visible catalog, laid out the same way,
 *  just with an empty award map so every achievement resolves as unearned (see toDisplay below)
 *  and hiddenEarned always empty (there's no family to have earned a hidden one). Lets a visitor
 *  browse the full catalog before signing in rather than staring at a blank gate. */
export async function getPublicCatalog(db: DB): Promise<DisplayCatalog> {
  return buildDisplayCatalog(db, new Map());
}

async function buildDisplayCatalog(
  db: DB,
  highestAwards: Map<string, HighestAward>,
): Promise<DisplayCatalog> {
  const earnedAchievementIds = [...highestAwards.keys()];

  // Ordered by createdAt so a section's chip order is stable across visits (matches seed
  // insertion order) instead of drifting with whatever order Postgres happens to return rows in
  // — achievement-display.tsx relies on this to show unearned chips in place, grayed, rather than
  // sorting them to the end of their section.
  const [visibleDefs, hiddenEarned] = await Promise.all([
    db.query.achievements.findMany({
      where: eq(achievements.hidden, false),
      with: { tiers: true },
      orderBy: (achievement, { asc }) => [asc(achievement.createdAt)],
    }),
    // Filtered in the query itself (WHERE hidden = true AND id IN (this family's earned ids)) —
    // never fetches an unearned hidden achievement's name/icon into application code at all,
    // rather than fetching-then-discarding, so there's nothing to accidentally leak downstream.
    earnedAchievementIds.length > 0
      ? db.query.achievements.findMany({
          where: and(eq(achievements.hidden, true), inArray(achievements.id, earnedAchievementIds)),
          with: { tiers: true },
          orderBy: (achievement, { asc }) => [asc(achievement.createdAt)],
        })
      : Promise.resolve([]),
  ]);

  // Progress-toward-next-tier is deliberately not computed here for now — even batched (one
  // shared rule-evaluation context per page view rather than one per achievement), it's still a
  // live character-roster + signup-matching pass on every visit, which measured as noticeably
  // slow. `getNextTierProgressForAchievements` (achievement-rules.ts) still exists and is
  // correct; this just stops calling it from the live display path until there's a cheaper way
  // to surface progress (e.g. computed alongside the QStash evaluation trigger, not per view).
  const toDisplay = (achievement: (typeof visibleDefs)[number]): DisplayAchievement => {
    const highest = highestAwards.get(achievement.id) ?? null;
    const sortedTiers = [...achievement.tiers].sort(
      (a, b) =>
        TIER_RANK[a.tier as AchievementTierLevel] - TIER_RANK[b.tier as AchievementTierLevel],
    );
    // Description preview resolves against the earned tier's ruleConfig, or — for an unearned
    // achievement — the lowest configured tier's, so the card always reads as real flavor text
    // ("Raided Molten Core 1 time this season.") instead of a raw {minCount}-style template.
    // Unearned uses goalDescription (present/imperative — "Raid Molten Core 1 time...") over
    // description (past tense) for the same reason as the next-tier preview below: nothing has
    // happened yet, so narrating it in the past tense reads as a false claim.
    const previewTier = highest ? sortedTiers.find((t) => t.tier === highest.tier) : sortedTiers[0];
    const previewRuleConfig = previewTier?.ruleConfig ?? null;
    const previewTemplate = highest
      ? achievement.description
      : (achievement.goalDescription ?? achievement.description);

    // "For {tier}:" preview of the tier above the one currently earned — earned achievements only
    // (an unearned achievement already shows its first-level description as the main line, and a
    // still-hidden Legendary Feat has no "next" to tease). This is a plain template resolution
    // against a tier config already in hand from the query above — not the live
    // roster/signup-matching pass the comment above warns off from the display path.
    let nextTier: AchievementTierLevel | null = null;
    let nextTierDescription: string | null = null;
    if (highest && !achievement.hidden) {
      const idx = sortedTiers.findIndex((t) => t.tier === highest.tier);
      const nextTierRow = idx >= 0 ? sortedTiers[idx + 1] : undefined;
      if (nextTierRow) {
        nextTier = nextTierRow.tier as AchievementTierLevel;
        // goalDescription (imperative/present tense — "Freeze and/or burn things 5 times...") over
        // description (past tense — "Your mage froze and/or burned things 5 times...") specifically
        // because this is a preview of something not yet earned; falls back to description itself
        // for the handful of achievements with no goal phrasing written yet.
        nextTierDescription = resolveAchievementDescription(
          achievement.goalDescription ?? achievement.description,
          nextTierRow.ruleConfig,
          achievement.scope,
        );
      }
    }

    return {
      achievementId: achievement.id,
      name: achievement.name,
      icon: achievement.icon,
      description: resolveAchievementDescription(
        previewTemplate,
        previewRuleConfig,
        achievement.scope,
      ),
      nextTier,
      nextTierDescription: nextTierDescription || null,
      scope: achievement.scope,
      ruleShape: achievement.ruleShape,
      wowClass:
        previewRuleConfig?.shape === "class_attendance_threshold" ? previewRuleConfig.class : null,
      highestTierEarned: highest?.tier ?? null,
      achievementAwardId: highest?.achievementAwardId ?? null,
      progress: null,
    };
  };

  const visible = visibleDefs.map(toDisplay);
  const hiddenEarnedDisplay = hiddenEarned.map(toDisplay);

  return { visible, hiddenEarned: hiddenEarnedDisplay };
}

export interface AdminAwardHolder {
  achievementAwardId: string;
  primaryCharacterId: number;
  characterName: string;
  characterClass: string;
  source: "rule" | "manual";
  awardedAt: Date;
}

export interface AdminAchievementTier {
  achievementTierId: string;
  tier: AchievementTierLevel;
  /** True for a manually-granted tier (no ruleConfig) — the admin panel's Grant action only
   *  targets these; a rule-managed tier can only ever be earned, never hand-granted. */
  isManual: boolean;
  /** Resolved against this specific tier's ruleConfig (see resolveAchievementDescription) — a
   *  Copper vs Thorium tier of the same achievement reads different numbers. The admin panel
   *  shows the lowest tier's version under the achievement name and each tier's own version in
   *  that medal's tooltip. */
  description: string;
  holders: AdminAwardHolder[];
}

export interface AdminAchievement {
  achievementId: string;
  name: string;
  description: string | null;
  icon: string;
  scope: "season" | "all_time";
  seasonName: string | null;
  hidden: boolean;
  /** Null means every tier is manual-only — the admin panel's "custom achievements" filter. */
  ruleShape: string | null;
  tiers: AdminAchievementTier[];
}

/** Backs the Manage Achievements admin panel — every achievement, every tier, every holder in one
 *  pass (small tables at this guild's scale, so one nested query beats N+1 per-tier holder
 *  fetches). Not gated here; the achievement.getAdminCatalog procedure is the ACHIEVEMENT_MANAGE
 *  gate. */
export async function getAdminCatalog(db: DB): Promise<AdminAchievement[]> {
  const rows = await db.query.achievements.findMany({
    with: {
      season: true,
      tiers: {
        with: {
          awards: {
            with: {
              primaryCharacter: { columns: { characterId: true, name: true, class: true } },
            },
          },
        },
      },
    },
    orderBy: (achievement, { asc }) => [asc(achievement.createdAt)],
  });

  return rows.map((achievement) => {
    const sortedTiers = [...achievement.tiers].sort(
      (a, b) =>
        TIER_RANK[a.tier as AchievementTierLevel] - TIER_RANK[b.tier as AchievementTierLevel],
    );

    // The rule engine awards every tier a family crosses independently — a family sitting at gold
    // also holds separate copper and silver award rows. The admin table shows a holder once, under
    // the highest tier they've earned, not once per tier crossed along the way.
    const highestTierRankByCharacter = new Map<number, number>();
    for (const tier of sortedTiers) {
      const rank = TIER_RANK[tier.tier as AchievementTierLevel];
      for (const award of tier.awards) {
        const current = highestTierRankByCharacter.get(award.primaryCharacterId) ?? -1;
        if (rank > current) highestTierRankByCharacter.set(award.primaryCharacterId, rank);
      }
    }

    return {
      achievementId: achievement.id,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      scope: achievement.scope,
      seasonName: achievement.season?.name ?? null,
      hidden: achievement.hidden,
      ruleShape: achievement.ruleShape,
      tiers: sortedTiers.map((tier) => {
        const rank = TIER_RANK[tier.tier as AchievementTierLevel];
        return {
          achievementTierId: tier.id,
          tier: tier.tier as AchievementTierLevel,
          isManual: tier.ruleConfig === null,
          description: resolveAchievementDescription(
            achievement.description,
            tier.ruleConfig,
            achievement.scope,
          ),
          holders: [...tier.awards]
            .filter((award) => highestTierRankByCharacter.get(award.primaryCharacterId) === rank)
            .sort((a, b) => a.primaryCharacter.name.localeCompare(b.primaryCharacter.name))
            .map((award) => ({
              achievementAwardId: award.id,
              primaryCharacterId: award.primaryCharacterId,
              characterName: award.primaryCharacter.name,
              characterClass: award.primaryCharacter.class,
              source: award.source,
              awardedAt: award.awardedAt,
            })),
        };
      }),
    };
  });
}
