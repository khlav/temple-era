import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { type db as database } from "~/server/db";
import {
  achievementAwards,
  achievementTiers,
  characters,
  raidLogAttendeeMap,
  raidLogs,
  raidSignupSnapshotLinks,
  raids,
  type AchievementRuleConfig,
} from "~/server/db/schema";
import { getTuesdayAnchoredWeekStart } from "~/lib/lockout-weeks";
import { getSignupSnapshotHistoryForOccurrence } from "~/server/services/raid-helper-snapshot-queries";
import {
  matchSignupsToCharacters,
  type SignupInput,
  type SignupMatchResult,
} from "~/server/api/helpers/match-signups";

type DB = typeof database;
type AchievementTierLevel = "bronze" | "silver" | "gold" | "platinum";
const TIER_ORDER: AchievementTierLevel[] = ["bronze", "silver", "gold", "platinum"];

export interface EvaluationResult {
  crossed: boolean;
  progress: { current: number; target: number };
}

export interface EvaluationWindow {
  start: Date | null;
  end: Date;
}

/**
 * ~/lib/lockout-weeks.ts's `getLockoutWeeks` is NOT `asOf`-parameterized — it always anchors on
 * real wall-clock time internally, which would break both testability and correctness for a
 * historical `asOf`. `getTuesdayAnchoredWeekStart` IS pure and takes an explicit date, so the
 * lockout floor is computed directly from it instead of going through `getLockoutWeeks` (which
 * the original spec sketch called for) — see implementation-notes-phase-2.html.
 *
 * `lockoutWeeks` counts the week containing `asOf` as week 1 — `lockoutWeeks=4` spans the current
 * (partial) lockout week plus the 3 before it.
 */
function lockoutFloorFor(lockoutWeeks: number, asOf: Date): Date {
  const currentWeekStart = getTuesdayAnchoredWeekStart(asOf);
  const floor = new Date(currentWeekStart);
  floor.setUTCDate(floor.getUTCDate() - 7 * (lockoutWeeks - 1));
  return floor;
}

export function resolveEvaluationWindow(
  achievementScope: "season" | "all_time",
  seasonStartDate: Date | null,
  lockoutWeeks: number | undefined,
  asOf: Date,
): EvaluationWindow {
  const lockoutFloor = lockoutWeeks ? lockoutFloorFor(lockoutWeeks, asOf) : null;

  if (achievementScope === "all_time") {
    return { start: lockoutFloor, end: asOf };
  }

  if (!seasonStartDate) {
    // A season-scoped achievement with no season is malformed data — Phase 1's service layer
    // validates this at creation time, so reaching here means something slipped past that
    // check. An unbounded window here would reproduce the exact pre-season instant-earn bug
    // the real `season` entity exists to prevent, so this is a hard error, not a silent fallback.
    throw new Error("resolveEvaluationWindow: season-scoped achievement has no seasonStartDate");
  }

  const start = lockoutFloor && lockoutFloor > seasonStartDate ? lockoutFloor : seasonStartDate;
  return { start, end: asOf };
}

function withinWindow(date: Date, window: EvaluationWindow): boolean {
  return date <= window.end && (window.start === null || date >= window.start);
}

export interface AttendedRaid {
  raidId: number;
  characterId: number;
  zone: string;
  class: string;
  lockoutWeekStart: Date;
  startTime: Date;
}

export interface MatchedSignup {
  raidId: number;
  signedUpCharacterId: number;
  bucket: "confirmed" | "bench" | "tentative" | "absent";
  checkpointHoursBeforeStart: number;
  /** The raid's own start time — needed because a signup-only shape (Bench Credit) has no
   *  corresponding attendedRaids row to borrow a date from; window-filtering matchedSignups
   *  must not depend on attendance existing. */
  raidStartTime: Date;
}

export interface RuleEvaluationContext {
  familyCharacterIds: number[];
  attendedRaids: AttendedRaid[];
  matchedSignups: MatchedSignup[];
  /** Every raid in the fetch window, regardless of whether this family attended — the
   *  denominator Attendance Threshold needs to compute a percent purely from context data,
   *  without its own separate DB call (see implementation-notes-phase-2.html). */
  raidsInWindow: Array<{ raidId: number; startTime: Date }>;
}

/** Maps a match-signups.ts result to this context's bucket taxonomy, or null when no family
 *  could be identified at all (ambiguous/unmatched — excluded per the Phase 1 decision log).
 *  `status: "skipped"` (a non-class-name signup like "bench") still carries a resolved family
 *  via `matchedPrimaryCharacterId` when name/Discord matching succeeded — see match-signups.ts's
 *  `resolveFamily`, which returns `matchedCharacter` set to the primary character in that case. */
function classifyBucket(result: SignupMatchResult): MatchedSignup["bucket"] | null {
  if (result.matchedPrimaryCharacterId == null) return null;
  if (result.status === "matched") return "confirmed";
  if (result.status === "skipped") {
    const cn = result.className.toLowerCase();
    if (cn === "bench") return "bench";
    if (cn === "tentative" || cn === "late") return "tentative";
    if (cn === "absent" || cn === "absence") return "absent";
  }
  return null;
}

function checkpointToHours(checkpoint: string): number {
  return Number(checkpoint.replace("h", ""));
}

/**
 * Fetches every raw fact this family's rule tiers could need, already filtered to
 * `[windowFloor, asOf]` (the widest window across the tiers being evaluated — each scorer
 * re-clips to its own tier's narrower window from this superset).
 */
export async function buildRuleEvaluationContext(
  db: DB,
  primaryCharacterId: number,
  windowFloor: Date | null,
  asOf: Date,
): Promise<RuleEvaluationContext> {
  const allCharacters = await db
    .select({
      characterId: characters.characterId,
      class: characters.class,
      primaryCharacterId: characters.primaryCharacterId,
    })
    .from(characters)
    .where(eq(characters.isIgnored, false));
  const familyRows = allCharacters.filter(
    (c) => c.characterId === primaryCharacterId || c.primaryCharacterId === primaryCharacterId,
  );
  const familyCharacterIds = familyRows.map((c) => c.characterId);
  const classByCharacterId = new Map(familyRows.map((c) => [c.characterId, c.class]));

  if (familyCharacterIds.length === 0) {
    return { familyCharacterIds: [], attendedRaids: [], matchedSignups: [], raidsInWindow: [] };
  }

  const floorStr = windowFloor ? windowFloor.toISOString().split("T")[0]! : undefined;
  const asOfStr = asOf.toISOString().split("T")[0]!;

  const attendanceRows = await db
    .select({
      raidId: raids.raidId,
      zone: raids.zone,
      date: raids.date,
      characterId: raidLogAttendeeMap.characterId,
    })
    .from(raidLogAttendeeMap)
    .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
    .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
    .where(
      and(
        inArray(raidLogAttendeeMap.characterId, familyCharacterIds),
        eq(raidLogAttendeeMap.isIgnored, false),
        floorStr ? gte(raids.date, floorStr) : undefined,
        lte(raids.date, asOfStr),
      ),
    );

  const attendedRaids: AttendedRaid[] = attendanceRows.map((r) => ({
    raidId: r.raidId,
    characterId: r.characterId,
    zone: r.zone,
    class: classByCharacterId.get(r.characterId) ?? "Unknown",
    lockoutWeekStart: getTuesdayAnchoredWeekStart(new Date(r.date)),
    startTime: new Date(r.date),
  }));

  // Every raid in range, regardless of attendance — the denominator Attendance Threshold needs
  // to stay a pure, context-only computation (see implementation-notes-phase-2.html) instead of
  // its own separate call to computeAttendance.
  const allRaidsInRange = await db
    .select({ raidId: raids.raidId, date: raids.date })
    .from(raids)
    .where(and(floorStr ? gte(raids.date, floorStr) : undefined, lte(raids.date, asOfStr)));
  const raidsInWindow = allRaidsInRange.map((r) => ({
    raidId: r.raidId,
    startTime: new Date(r.date),
  }));

  // Scoped by the link's own startTime, NOT by attendedRaids — Bench Credit needs signups for
  // raids the family did NOT attend (being benched means exactly that), so signup resolution
  // can't be limited to already-attended raids the way an earlier draft of this function did.
  // Consistency/Flexibility still correctly require attendance — that check happens in each
  // scorer, by cross-referencing this same matchedSignups array against attendedRaids.
  const links = await db.query.raidSignupSnapshotLinks.findMany({
    where: and(
      windowFloor ? gte(raidSignupSnapshotLinks.startTime, windowFloor) : undefined,
      lte(raidSignupSnapshotLinks.startTime, asOf),
    ),
  });

  const matchedSignups: MatchedSignup[] = [];
  for (const link of links) {
    const history = await getSignupSnapshotHistoryForOccurrence(
      link.raidHelperEventId,
      link.startTime,
    );
    for (const snapshotRow of history) {
      const hours = checkpointToHours(snapshotRow.checkpoint);
      const signupInputs: SignupInput[] = snapshotRow.signups.map((s) => ({
        userId: s.userId,
        discordName: s.name,
        className: s.className,
        specName: s.specName,
      }));
      const results = await matchSignupsToCharacters(db, signupInputs);
      for (const result of results) {
        if (result.matchedPrimaryCharacterId !== primaryCharacterId) continue;
        const bucket = classifyBucket(result);
        if (!bucket) continue;
        matchedSignups.push({
          raidId: link.raidId,
          signedUpCharacterId: result.matchedCharacter?.characterId ?? primaryCharacterId,
          bucket,
          checkpointHoursBeforeStart: hours,
          raidStartTime: link.startTime,
        });
      }
    }
  }

  return { familyCharacterIds, attendedRaids, matchedSignups, raidsInWindow };
}

// ─── Scoring: Attendance Threshold ─────────────────────────────────────────────

/** Pure, like the other 8 — computed entirely from `context.raidsInWindow`/`attendedRaids`
 *  rather than a separate DB call, per the spec's "all I/O isolated in the context builder"
 *  design (an earlier draft called `computeAttendance` directly from here; see
 *  implementation-notes-phase-2.html). The denominator matches computeAttendance's own
 *  ATTENDED-only definition of "eligible raid" (BENCH is intentionally not counted as
 *  attendance here, consistent with the rest of the app's attendance-percent calculation). */
function scoreAttendanceThreshold(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "attendance_threshold" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const totalRaidIds = new Set(
    context.raidsInWindow.filter((r) => withinWindow(r.startTime, window)).map((r) => r.raidId),
  );
  const attendedRaidIds = new Set(
    context.attendedRaids
      .filter((r) => withinWindow(r.startTime, window) && totalRaidIds.has(r.raidId))
      .map((r) => r.raidId),
  );
  const total = totalRaidIds.size;
  const percent = total === 0 ? 0 : Math.round((attendedRaidIds.size / total) * 100);
  return {
    crossed: percent >= config.minPercent,
    progress: { current: percent, target: config.minPercent },
  };
}

// ─── Scoring: the remaining 8 shapes (all pure — no DB access) ─────────────────

function scoreConsistencyMatch(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "consistency_match" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const inWindowRaidIds = new Set(
    context.attendedRaids.filter((r) => withinWindow(r.startTime, window)).map((r) => r.raidId),
  );
  const attendedByRaidAndCharacter = new Set(
    context.attendedRaids
      .filter((r) => inWindowRaidIds.has(r.raidId))
      .map((r) => `${r.raidId}:${r.characterId}`),
  );
  const qualifyingRaidIds = new Set(
    context.matchedSignups
      .filter(
        (s) =>
          withinWindow(s.raidStartTime, window) &&
          s.bucket === "confirmed" &&
          s.checkpointHoursBeforeStart >= 96 &&
          attendedByRaidAndCharacter.has(`${s.raidId}:${s.signedUpCharacterId}`),
      )
      .map((s) => s.raidId),
  );
  const count = qualifyingRaidIds.size;
  return {
    crossed: count >= config.minCount,
    progress: { current: count, target: config.minCount },
  };
}

function scoreFlexibilityMatch(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "flexibility_match" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const inWindowRaidIds = new Set(
    context.attendedRaids.filter((r) => withinWindow(r.startTime, window)).map((r) => r.raidId),
  );
  const attendedCharacterIdsByRaid = new Map<number, Set<number>>();
  for (const r of context.attendedRaids) {
    if (!inWindowRaidIds.has(r.raidId)) continue;
    if (!attendedCharacterIdsByRaid.has(r.raidId))
      attendedCharacterIdsByRaid.set(r.raidId, new Set());
    attendedCharacterIdsByRaid.get(r.raidId)!.add(r.characterId);
  }
  const qualifyingRaidIds = new Set(
    context.matchedSignups
      .filter((s) => withinWindow(s.raidStartTime, window) && s.bucket === "confirmed")
      .filter((s) => {
        // Cross-character: someone from the family attended this raid, but not the specific
        // character that signed up for it.
        const attendees = attendedCharacterIdsByRaid.get(s.raidId);
        return !!attendees && [...attendees].some((id) => id !== s.signedUpCharacterId);
      })
      .map((s) => s.raidId),
  );
  const count = qualifyingRaidIds.size;
  return {
    crossed: count >= config.minCount,
    progress: { current: count, target: config.minCount },
  };
}

function scoreBenchCreditCount(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "bench_credit_count" }>,
  window: EvaluationWindow,
): EvaluationResult {
  // Deduped by raid: a raid can carry a "bench" bucket across multiple captured checkpoints
  // (144h, 120h, ... 0h), and should still only count once toward this achievement. Windowed by
  // the signup's own raidStartTime — deliberately NOT via attendedRaids, since being benched
  // means the family did not attend that raid at all.
  const count = new Set(
    context.matchedSignups
      .filter((s) => withinWindow(s.raidStartTime, window) && s.bucket === "bench")
      .map((s) => s.raidId),
  ).size;
  return {
    crossed: count >= config.minCount,
    progress: { current: count, target: config.minCount },
  };
}

function scoreZoneAttendanceThreshold(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "zone_attendance_threshold" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const count = new Set(
    context.attendedRaids
      .filter((r) => withinWindow(r.startTime, window) && r.zone === config.zone)
      .map((r) => r.raidId),
  ).size;
  return {
    crossed: count >= config.minCount,
    progress: { current: count, target: config.minCount },
  };
}

function scoreRaidMarathonDensity(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "raid_marathon_density" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const byWeek = new Map<number, Set<number>>();
  for (const r of context.attendedRaids) {
    if (!withinWindow(r.startTime, window)) continue;
    const key = r.lockoutWeekStart.getTime();
    if (!byWeek.has(key)) byWeek.set(key, new Set());
    byWeek.get(key)!.add(r.raidId);
  }
  const max = Math.max(0, ...[...byWeek.values()].map((s) => s.size));
  return {
    crossed: max >= config.minRaidsInOneWeek,
    progress: { current: max, target: config.minRaidsInOneWeek },
  };
}

function scoreZoneBreadthWindow(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "zone_breadth_window" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const size = new Set(
    context.attendedRaids.filter((r) => withinWindow(r.startTime, window)).map((r) => r.zone),
  ).size;
  return {
    crossed: size >= config.minDistinctZones,
    progress: { current: size, target: config.minDistinctZones },
  };
}

function scoreClassBreadthWindow(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "class_breadth_window" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const size = new Set(
    context.attendedRaids.filter((r) => withinWindow(r.startTime, window)).map((r) => r.class),
  ).size;
  return {
    crossed: size >= config.minDistinctClasses,
    progress: { current: size, target: config.minDistinctClasses },
  };
}

function scoreFamilyDoubleUpCooccurrence(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "family_double_up_cooccurrence" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const charactersByRaid = new Map<number, Set<number>>();
  for (const r of context.attendedRaids) {
    if (!withinWindow(r.startTime, window)) continue;
    if (!charactersByRaid.has(r.raidId)) charactersByRaid.set(r.raidId, new Set());
    charactersByRaid.get(r.raidId)!.add(r.characterId);
  }
  const count = [...charactersByRaid.values()].filter((set) => set.size >= 2).length;
  return {
    crossed: count >= config.minCount,
    progress: { current: count, target: config.minCount },
  };
}

function scoreByShapeSync(
  context: RuleEvaluationContext,
  config: AchievementRuleConfig,
  window: EvaluationWindow,
): EvaluationResult {
  switch (config.shape) {
    case "attendance_threshold":
      return scoreAttendanceThreshold(context, config, window);
    case "consistency_match":
      return scoreConsistencyMatch(context, config, window);
    case "flexibility_match":
      return scoreFlexibilityMatch(context, config, window);
    case "bench_credit_count":
      return scoreBenchCreditCount(context, config, window);
    case "zone_attendance_threshold":
      return scoreZoneAttendanceThreshold(context, config, window);
    case "raid_marathon_density":
      return scoreRaidMarathonDensity(context, config, window);
    case "zone_breadth_window":
      return scoreZoneBreadthWindow(context, config, window);
    case "class_breadth_window":
      return scoreClassBreadthWindow(context, config, window);
    case "family_double_up_cooccurrence":
      return scoreFamilyDoubleUpCooccurrence(context, config, window);
  }
}

/** Single dispatch point every caller (orchestrator, progress lookups, tests) goes through — a
 *  new achievement reusing an existing shape needs zero changes here, only a new
 *  achievement-definitions.ts entry (see extensibility criterion). Declared async (though every
 *  shape is now pure) so a future shape needing real I/O doesn't force a signature change on
 *  every existing call site. */
export async function scoreByShape(
  db: DB,
  primaryCharacterId: number,
  context: RuleEvaluationContext,
  config: AchievementRuleConfig,
  window: EvaluationWindow,
): Promise<EvaluationResult> {
  void db;
  void primaryCharacterId;
  return scoreByShapeSync(context, config, window);
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────

export interface NewAward {
  achievementTierId: string;
  primaryCharacterId: number;
}

export async function evaluateAchievementsForFamily(
  db: DB,
  primaryCharacterId: number,
  asOf: Date,
): Promise<{ newAwards: NewAward[] }> {
  const tiers = await db.query.achievementTiers.findMany({
    where: (tier, { isNotNull }) => isNotNull(tier.ruleConfig),
    with: { achievement: { with: { season: true } } },
  });

  const lockoutWeeksValues = tiers
    .map((t) => (t.ruleConfig as AchievementRuleConfig).lockoutWeeks)
    .filter((v): v is number => typeof v === "number");
  const widestLockoutWeeks =
    lockoutWeeksValues.length > 0 ? Math.max(...lockoutWeeksValues) : undefined;
  const anyUnbounded = tiers.some((t) => {
    const config = t.ruleConfig as AchievementRuleConfig;
    return t.achievement.scope === "all_time" && !config.lockoutWeeks;
  });
  const widestFloor = anyUnbounded
    ? null
    : widestLockoutWeeks
      ? lockoutFloorFor(widestLockoutWeeks, asOf)
      : null;

  const context = await buildRuleEvaluationContext(db, primaryCharacterId, widestFloor, asOf);

  const newAwards: NewAward[] = [];
  for (const tier of tiers) {
    const config = tier.ruleConfig as AchievementRuleConfig;
    const window = resolveEvaluationWindow(
      tier.achievement.scope,
      tier.achievement.season?.startDate ?? null,
      config.lockoutWeeks,
      asOf,
    );
    const result = await scoreByShape(db, primaryCharacterId, context, config, window);
    if (!result.crossed) continue;

    const inserted = await db
      .insert(achievementAwards)
      .values({
        achievementTierId: tier.id,
        primaryCharacterId,
        source: "rule",
        awardedAt: asOf,
      })
      .onConflictDoNothing({
        target: [achievementAwards.achievementTierId, achievementAwards.primaryCharacterId],
      })
      .returning({ id: achievementAwards.id });

    if (inserted.length > 0) {
      newAwards.push({ achievementTierId: tier.id, primaryCharacterId });
    }
  }

  return { newAwards };
}

export async function getHighestTierPerAchievement(
  db: DB,
  primaryCharacterId: number,
): Promise<Map<string, AchievementTierLevel>> {
  const rows = await db.query.achievementAwards.findMany({
    where: eq(achievementAwards.primaryCharacterId, primaryCharacterId),
    with: { achievementTier: true },
  });
  const highest = new Map<string, AchievementTierLevel>();
  for (const row of rows) {
    const achievementId = row.achievementTier.achievementId;
    const tier = row.achievementTier.tier as AchievementTierLevel;
    const current = highest.get(achievementId);
    if (!current || TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(current)) {
      highest.set(achievementId, tier);
    }
  }
  return highest;
}

export async function getNextTierProgress(
  db: DB,
  primaryCharacterId: number,
  achievementId: string,
  asOf: Date,
): Promise<{
  nextTier: AchievementTierLevel;
  progress: { current: number; target: number };
} | null> {
  const tiers = await db.query.achievementTiers.findMany({
    where: eq(achievementTiers.achievementId, achievementId),
    with: { achievement: { with: { season: true } } },
  });
  if (tiers.length === 0) return null;

  const awarded = await db.query.achievementAwards.findMany({
    where: and(
      eq(achievementAwards.primaryCharacterId, primaryCharacterId),
      inArray(
        achievementAwards.achievementTierId,
        tiers.map((t) => t.id),
      ),
    ),
  });
  const awardedTierIds = new Set(awarded.map((a) => a.achievementTierId));

  const orderedTiers = [...tiers].sort(
    (a, b) =>
      TIER_ORDER.indexOf(a.tier as AchievementTierLevel) -
      TIER_ORDER.indexOf(b.tier as AchievementTierLevel),
  );
  const next = orderedTiers.find((t) => !awardedTierIds.has(t.id));
  if (!next || !next.ruleConfig) return null; // maxed out, or manual-only (no rule to project progress from)

  const config = next.ruleConfig as AchievementRuleConfig;
  const window = resolveEvaluationWindow(
    next.achievement.scope,
    next.achievement.season?.startDate ?? null,
    config.lockoutWeeks,
    asOf,
  );
  const windowFloor = window.start;
  const context = await buildRuleEvaluationContext(db, primaryCharacterId, windowFloor, asOf);
  const result = await scoreByShape(db, primaryCharacterId, context, config, window);
  return { nextTier: next.tier as AchievementTierLevel, progress: result.progress };
}
