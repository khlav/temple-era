import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { type db as database } from "~/server/db";
import {
  achievements,
  achievementTiers,
  achievementAwards,
  characters,
  type AchievementRuleConfig,
} from "~/server/db/schema";
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
  /** Distinct families holding an award for THIS tier of this achievement — not "any tier", so a
   *  Gold reveal counts Gold-or-better holders, not everyone who merely has Copper. This falls out
   *  for free from the tier-crossing model: crossing Arcanite also crosses (and inserts a row for)
   *  every lower tier in the same pass — see achievement-rules.ts's evaluateAchievementsForFamilies
   *  — so "holds an award at exactly this tier" already means "at this tier or higher", with no
   *  rank comparison needed. Always >= 1, since the family this award is being displayed to is
   *  itself a holder. */
  holderCount: number;
  /** Populated only when holderCount <= 3: one label per holder, "you" for the viewer themselves
   *  (when known — see viewerPrimaryCharacterId), a character name for everyone else, "you" sorted
   *  first when present. Lets the reveal overlay name names ("Only you", "Only Desil holds this
   *  achievement", "Only you and Desil hold this achievement") instead of a bare count once it
   *  gets too crowded to name everyone (holderCount > 3, when this is null). */
  holderLabels: string[] | null;
}

/** toUnseenAward's own return shape, before rarity is merged in by withRarity/getAwardById below —
 *  kept private so every exported award-returning function is forced through one of those, never
 *  accidentally handing out a UnseenAward with a stale/default holderCount. achievementTierId is
 *  likewise private to this file: the grouping key withRarity needs for the "this tier, not any
 *  tier" count (see holderCount's own doc comment), stripped back off before returning. */
type RawAward = Omit<UnseenAward, "holderCount" | "holderLabels"> & { achievementTierId: string };

/** Reveal overlay shows real names up to this many holders before falling back to a bare count. */
const MAX_NAMED_HOLDERS = 3;

// Shared by every query below that walks achievementAwards -> achievementTier -> achievement —
// a plain duck-typed shape (rather than deriving from a specific `with`-clause query's inferred
// return type) since Drizzle's relational query builder overloads its return type per `with`
// shape, which doesn't factor out cleanly across the differently-shaped queries below.
interface AwardRow {
  id: string;
  awardedAt: Date;
  achievementTier: {
    id: string;
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

function toUnseenAward(row: AwardRow): RawAward {
  return {
    achievementAwardId: row.id,
    achievementId: row.achievementTier.achievementId,
    achievementTierId: row.achievementTier.id,
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

function byRarestThenNewest(
  a: { tier: AchievementTierLevel; awardedAt: Date },
  b: { tier: AchievementTierLevel; awardedAt: Date },
): number {
  const r = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (r !== 0) return r;
  return b.awardedAt.getTime() - a.awardedAt.getTime();
}

/** Distinct primaryCharacterId count per achievementTierId — one grouped query for however many
 *  tiers a batch of awards touches, rather than one count query per award. No join needed:
 *  achievementTierId is a column on achievementAwards itself, and (per holderCount's own doc
 *  comment) filtering to exactly this tier already means "this tier or higher". */
async function getHolderCounts(db: DB, achievementTierIds: string[]): Promise<Map<string, number>> {
  if (achievementTierIds.length === 0) return new Map();
  const rows = await db
    .select({
      achievementTierId: achievementAwards.achievementTierId,
      count: sql<number>`count(distinct ${achievementAwards.primaryCharacterId})::int`,
    })
    .from(achievementAwards)
    .where(inArray(achievementAwards.achievementTierId, achievementTierIds))
    .groupBy(achievementAwards.achievementTierId);
  return new Map(rows.map((r) => [r.achievementTierId, r.count]));
}

/** The actual holder ids for tiers with <= MAX_NAMED_HOLDERS holders — a second, narrower query
 *  rather than folding into getHolderCounts, so a common tier with dozens of holders never pulls
 *  its full holder list just to get thrown away. */
async function getHolderIds(db: DB, achievementTierIds: string[]): Promise<Map<string, number[]>> {
  if (achievementTierIds.length === 0) return new Map();
  const rows = await db
    .selectDistinct({
      achievementTierId: achievementAwards.achievementTierId,
      primaryCharacterId: achievementAwards.primaryCharacterId,
    })
    .from(achievementAwards)
    .where(inArray(achievementAwards.achievementTierId, achievementTierIds));
  const byTier = new Map<string, number[]>();
  for (const r of rows) {
    const ids = byTier.get(r.achievementTierId) ?? [];
    ids.push(r.primaryCharacterId);
    byTier.set(r.achievementTierId, ids);
  }
  return byTier;
}

/** Merges each award's rarity in via one batched getHolderCounts call, a narrower batched
 *  getHolderIds call for anything at or under MAX_NAMED_HOLDERS, and a batched character-name
 *  lookup for whichever of those ids aren't the viewer — every exported award-returning function
 *  below routes through this rather than computing holderCount/holderLabels itself.
 *  `viewerPrimaryCharacterId` is the family currently looking at these awards — null when there's
 *  no way to know (a signed-out getAwardById caller), in which case a label can only ever resolve
 *  to a name, never "you". */
async function withRarity(
  db: DB,
  awards: RawAward[],
  viewerPrimaryCharacterId: number | null,
): Promise<UnseenAward[]> {
  const achievementTierIds = [...new Set(awards.map((a) => a.achievementTierId))];
  const counts = await getHolderCounts(db, achievementTierIds);

  const namedTierIds = achievementTierIds.filter(
    (id) => (counts.get(id) ?? 1) <= MAX_NAMED_HOLDERS,
  );
  const holderIds = await getHolderIds(db, namedTierIds);

  const idsNeedingNames = new Set<number>();
  for (const ids of holderIds.values()) {
    for (const id of ids) if (id !== viewerPrimaryCharacterId) idsNeedingNames.add(id);
  }
  const names =
    idsNeedingNames.size === 0
      ? new Map<number, string>()
      : new Map(
          (
            await db
              .select({ characterId: characters.characterId, name: characters.name })
              .from(characters)
              .where(inArray(characters.characterId, [...idsNeedingNames]))
          ).map((r) => [r.characterId, r.name]),
        );

  return awards.map((a) => {
    const { achievementTierId, ...rest } = a;
    const holderCount = counts.get(achievementTierId) ?? 1;
    const ids = holderIds.get(achievementTierId);
    // An empty resolved list must fall through to the count path exactly like a genuinely absent
    // one — `holderLabels: []` reads as truthy downstream (formatEarnedRarityLine's "1 holder" and
    // "2-3 holders" branches both guard on it being present, not non-empty) and renders as a
    // malformed "..., and undefined" rather than the bare-count line.
    const holderLabels =
      !ids || ids.length === 0
        ? null
        : ids
            // "you" first when present, then alphabetically by real name for a stable order.
            .map((id) => (id === viewerPrimaryCharacterId ? "you" : (names.get(id) ?? "someone")))
            .sort((x, y) => (x === "you" ? -1 : y === "you" ? 1 : x.localeCompare(y)));
    return { ...rest, holderCount, holderLabels };
  });
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
  return withRarity(db, rows.map(toUnseenAward).sort(byRarestThenNewest), primaryCharacterId);
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
  return withRarity(db, rows.map(toUnseenAward).sort(byRarestThenNewest), primaryCharacterId);
}

/** Backs the Achievements page's replay — works regardless of `seenAt`, unlike getUnseenAwards.
 *  `viewerPrimaryCharacterId` is the signed-in viewer's own family, when known (this can be called
 *  signed-out, or for someone else's award via a character page's chip click — see
 *  soleHolderLabel's own doc comment on UnseenAward). */
export async function getAwardById(
  db: DB,
  achievementAwardId: string,
  viewerPrimaryCharacterId: number | null,
): Promise<UnseenAward | null> {
  const row = await db.query.achievementAwards.findFirst({
    where: eq(achievementAwards.id, achievementAwardId),
    with: { achievementTier: { with: { achievement: true } } },
  });
  if (!row) return null;
  const [award] = await withRarity(db, [toUnseenAward(row)], viewerPrimaryCharacterId);
  return award!;
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

export interface AchievementLogEntry {
  /** Eastern calendar day the group falls on ("YYYY-MM-DD") — matches getEasternDate()'s own
   *  bucketing (raid-formatting.ts) so this lines up with how the rest of the app reads "the same
   *  day" for a timestamp. */
  day: string;
  /** Most recent awardedAt within the group — what the row's Date cell actually renders. */
  latestAwardedAt: Date;
  achievementTierId: string;
  tier: AchievementTierLevel;
  name: string;
  icon: string;
  /** Resolved against this tier's ruleConfig — see resolveAchievementDescription. "" when the
   *  achievement has no description template. */
  description: string;
  /** Unlike getDisplayCatalog/getPublicCatalog, this log intentionally does NOT mask hidden
   *  achievements — every row renders fully regardless of `hidden`, per explicit product
   *  direction that the log is a fine way to discover one exists. Carried through anyway in case
   *  a caller wants to style hidden rows differently later. */
  hidden: boolean;
  /** One award id from the group (earliest awardedAt) — enough to drive getAwardById's replay,
   *  which resolves rarity/holders across every award for that tier on its own. */
  replayAwardId: string;
  earners: { characterId: number; name: string; class: string }[];
}

export interface AchievementLogPage {
  entries: AchievementLogEntry[];
  hasMore: boolean;
}

/** Backs the Achievements Earned Log (`/achievements/log`) — one row per (Eastern day,
 *  achievementTierId), aggregating every family that crossed that tier that day. Offset-based
 *  pagination, same "small tables at this guild's scale" reasoning getAdminCatalog already
 *  relies on — no cursor/keyset machinery needed. Fetches `limit + 1` rows to derive `hasMore`
 *  without a separate count query.
 *
 *  Ordered date desc, achievement name asc, tier desc — all three have to be resolved and sorted
 *  *before* LIMIT/OFFSET slices the page, which is why achievement_tier/achievement are joined
 *  directly into this grouped query rather than looked up in a second batched query afterward
 *  (the latter only sees whichever tier ids happened to land on the current page, too late to
 *  affect which rows those are). Ordering by `achievementTiers.tier` directly relies on the
 *  Postgres enum's declared value order (achievement-schema.ts:
 *  copper/silver/gold/thorium/arcanite) matching TIER_RANK's 0..4 — enum comparison in Postgres
 *  follows declaration order, so `desc` on the raw column is already highest-tier-first. */
export async function getAchievementLogPage(
  db: DB,
  { limit, offset }: { limit: number; offset: number },
): Promise<AchievementLogPage> {
  // Reused (not recomputed) everywhere it's referenced below, so the generated SQL text is
  // guaranteed identical in the SELECT list and the GROUP BY/ORDER BY clauses rather than relying
  // on Postgres resolving an output alias back to its defining expression.
  const dayExpr = sql<string>`to_char(${achievementAwards.awardedAt} at time zone 'America/New_York', 'YYYY-MM-DD')`;
  // Typed `string`, not `Date` — postgres.js doesn't run its timestamptz->Date parser over a raw
  // aggregate expression's result column the way it does a plain typed column reference. Formatted
  // as an explicit UTC ISO-8601 string (rather than left as Postgres's own session-DateStyle-
  // dependent text output) so `new Date(...)` below parses it unambiguously regardless of the
  // connection's TimeZone setting.
  const latestAwardedAtExpr = sql<string>`to_char(max(${achievementAwards.awardedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

  const rows = await db
    .select({
      day: dayExpr,
      achievementTierId: achievementAwards.achievementTierId,
      latestAwardedAt: latestAwardedAtExpr,
      tier: achievementTiers.tier,
      ruleConfig: achievementTiers.ruleConfig,
      name: achievements.name,
      icon: achievements.icon,
      hidden: achievements.hidden,
      description: achievements.description,
      scope: achievements.scope,
      characterIds: sql<
        number[]
      >`array_agg(${achievementAwards.primaryCharacterId} order by ${achievementAwards.primaryCharacterId})`,
      // Earliest-awarded row in the group is the replay representative — arbitrary but stable.
      awardIds: sql<
        string[]
      >`array_agg(${achievementAwards.id} order by ${achievementAwards.awardedAt} asc)`,
    })
    .from(achievementAwards)
    .innerJoin(achievementTiers, eq(achievementAwards.achievementTierId, achievementTiers.id))
    .innerJoin(achievements, eq(achievementTiers.achievementId, achievements.id))
    .groupBy(
      dayExpr,
      achievementAwards.achievementTierId,
      achievementTiers.tier,
      achievementTiers.ruleConfig,
      achievements.name,
      achievements.icon,
      achievements.hidden,
      achievements.description,
      achievements.scope,
    )
    .orderBy(desc(dayExpr), asc(achievements.name), desc(achievementTiers.tier))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (page.length === 0) return { entries: [], hasMore: false };

  const allCharacterIds = [...new Set(page.flatMap((r) => r.characterIds))];
  const characterRows =
    allCharacterIds.length === 0
      ? []
      : await db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            class: characters.class,
          })
          .from(characters)
          .where(inArray(characters.characterId, allCharacterIds));
  const characterById = new Map(characterRows.map((c) => [c.characterId, c]));

  const entries: AchievementLogEntry[] = page.map((row) => {
    return {
      day: row.day,
      latestAwardedAt: new Date(row.latestAwardedAt),
      achievementTierId: row.achievementTierId,
      tier: row.tier as AchievementTierLevel,
      name: row.name,
      icon: row.icon,
      description: resolveAchievementDescription(row.description, row.ruleConfig, row.scope),
      hidden: row.hidden,
      replayAwardId: row.awardIds[0]!,
      earners: row.characterIds.map((characterId) => {
        const character = characterById.get(characterId);
        return {
          characterId,
          name: character?.name ?? "Unknown",
          class: character?.class ?? "",
        };
      }),
    };
  });

  return { entries, hasMore };
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
