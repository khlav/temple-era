import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { type db as database } from "~/server/db";
import {
  achievementAwards,
  achievementTiers,
  characterRecipeMap,
  characters,
  raidBenchMap,
  raidLogAttendeeMap,
  raidLogs,
  raidSignupSnapshotLinks,
  raids,
  type AchievementRuleConfig,
} from "~/server/db/schema";
import { getTuesdayAnchoredWeekStart } from "~/lib/lockout-weeks";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";
import { getSignupSnapshotHistoryForOccurrence } from "~/server/services/raid-helper-snapshot-queries";
import {
  matchSignupsToCharacters,
  type CharacterRosterEntry,
  type SignupInput,
  type SignupMatchResult,
} from "~/server/api/helpers/match-signups";

type DB = typeof database;
type AchievementTierLevel = "copper" | "silver" | "gold" | "thorium" | "arcanite";
const TIER_ORDER: AchievementTierLevel[] = ["copper", "silver", "gold", "thorium", "arcanite"];
const WEIGHTED_ATTENDANCE_WEEKLY_CAP = 3;

export interface EvaluationResult {
  crossed: boolean;
  progress: { current: number; target: number };
}

export interface EvaluationWindow {
  start: Date | null;
  end: Date;
}

/** `raids.date` is a bare Postgres `date` column (no time-of-day) representing an Eastern-Time
 *  raid night. Naively parsing it with `new Date(dateString)` treats it as UTC midnight instead —
 *  up to 5 hours earlier than the Eastern midnight it actually means — which is enough to place a
 *  season's opening-day raid before that season's real (Eastern-midnight) `startDate` and drop it
 *  from season-scoped scoring entirely. Anchoring through `fromZonedTime` fixes that: a raid dated
 *  identically to the season's start date lands on the same instant as `SEASON_2.startDate`, and
 *  `withinWindow`'s inclusive `>=` then keeps it in scope. */
function raidDateToInstant(date: string): Date {
  return fromZonedTime(`${date}T00:00:00`, EASTERN_TIMEZONE);
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
  seasonEndDate: Date | null,
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
  // Clamp the end too, not just the start — without this, a trigger firing after the season
  // closed (asOf > seasonEndDate) would still score raids/recipes that happened after the
  // season ended, awarding e.g. Season 2 achievements for post-season activity.
  const end = seasonEndDate && seasonEndDate < asOf ? seasonEndDate : asOf;
  return { start, end };
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
  /** `raids.attendanceWeight` — Naxx/AQ40/BWL default to 1, Molten Core to 0.5 (see
   *  `~/lib/raid-weights.ts`'s `getDefaultAttendanceWeight`, applied at raid-creation time and
   *  editable per-raid thereafter). Only consumed by scoreWeightedAttendanceThreshold; every
   *  other shape ignores it. */
  attendanceWeight: number;
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
  /** Officer-entered bench credit (`raid_bench_map` — "characters available for the raid but
   *  absent from the logs... earn the same credit as attendees"), NOT a Raid Helper "Bench" role
   *  signup — those are two unrelated signals and only this one is real, credit-bearing bench
   *  status. Same shape as attendedRaids for a raid the family didn't attend at all. */
  benchedRaids: AttendedRaid[];
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

/** Batched context builder — fetches every fact once per batch (character roster, this batch's
 *  attendance, raids in window, signup-link matching) regardless of how many families are
 *  requested, then derives each family's own slice in memory. Query order deliberately matches
 *  the original single-family implementation's (roster → attendance → raids-in-range → signup
 *  links → per-link history/matching) — existing tests assert on that sequence via chained
 *  `mockReturnValueOnce` calls, and there's no correctness reason for these independent queries
 *  to run in any particular order relative to each other.
 *
 *  The link-history fetch and `matchSignupsToCharacters` (which itself independently re-fetches
 *  the whole character roster) used to be redone from scratch inside a per-family loop, once per
 *  family, discarding every result but the one matching the current family — harmless at the
 *  ~20-40 families a single raid's QStash trigger evaluates, but O(families) redundant full-
 *  roster fetches + matching passes for a full-guild backfill. See the achievement-engine QA log.
 *  Prefer this over `buildRuleEvaluationContext` whenever evaluating more than one family at
 *  once (e.g. a whole raid's attendees). */
export async function buildRuleEvaluationContextsForFamilies(
  db: DB,
  primaryCharacterIds: number[],
  windowFloor: Date | null,
  asOf: Date,
): Promise<Map<number, RuleEvaluationContext>> {
  const results = new Map<number, RuleEvaluationContext>();
  if (primaryCharacterIds.length === 0) return results;

  const allCharacters: CharacterRosterEntry[] = await db
    .select({
      characterId: characters.characterId,
      name: characters.name,
      server: characters.server,
      class: characters.class,
      primaryCharacterId: characters.primaryCharacterId,
    })
    .from(characters)
    .where(eq(characters.isIgnored, false));

  const requested = new Set(primaryCharacterIds);
  const familyCharacterIdsByPrimary = new Map<number, number[]>();
  const classByCharacterId = new Map<number, string>();
  for (const c of allCharacters) {
    classByCharacterId.set(c.characterId, c.class);
    const root = c.primaryCharacterId ?? c.characterId;
    if (!requested.has(root)) continue;
    const list = familyCharacterIdsByPrimary.get(root) ?? [];
    list.push(c.characterId);
    familyCharacterIdsByPrimary.set(root, list);
  }

  const floorStr = windowFloor ? windowFloor.toISOString().split("T")[0]! : undefined;
  const asOfStr = asOf.toISOString().split("T")[0]!;

  const allFamilyCharacterIds = [...familyCharacterIdsByPrimary.values()].flat();
  const attendanceRows =
    allFamilyCharacterIds.length > 0
      ? await db
          .select({
            raidId: raids.raidId,
            zone: raids.zone,
            date: raids.date,
            characterId: raidLogAttendeeMap.characterId,
            attendanceWeight: raids.attendanceWeight,
          })
          .from(raidLogAttendeeMap)
          .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
          .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
          .where(
            and(
              inArray(raidLogAttendeeMap.characterId, allFamilyCharacterIds),
              eq(raidLogAttendeeMap.isIgnored, false),
              floorStr ? gte(raids.date, floorStr) : undefined,
              lte(raids.date, asOfStr),
            ),
          )
      : [];

  const attendedRaidsByCharacterId = new Map<number, AttendedRaid[]>();
  for (const r of attendanceRows) {
    const entry: AttendedRaid = {
      raidId: r.raidId,
      characterId: r.characterId,
      zone: r.zone,
      class: classByCharacterId.get(r.characterId) ?? "Unknown",
      lockoutWeekStart: getTuesdayAnchoredWeekStart(raidDateToInstant(r.date)),
      startTime: raidDateToInstant(r.date),
      attendanceWeight: r.attendanceWeight,
    };
    const list = attendedRaidsByCharacterId.get(r.characterId) ?? [];
    list.push(entry);
    attendedRaidsByCharacterId.set(r.characterId, list);
  }

  // raid_bench_map joins straight to raids (no raid_log hop needed — an officer sets this
  // directly on the raid, independent of whether a log was ever attached). This is the real bench
  // credit source; see RuleEvaluationContext.benchedRaids.
  const benchRows =
    allFamilyCharacterIds.length > 0
      ? await db
          .select({
            raidId: raids.raidId,
            zone: raids.zone,
            date: raids.date,
            characterId: raidBenchMap.characterId,
            attendanceWeight: raids.attendanceWeight,
          })
          .from(raidBenchMap)
          .innerJoin(raids, eq(raidBenchMap.raidId, raids.raidId))
          .where(
            and(
              inArray(raidBenchMap.characterId, allFamilyCharacterIds),
              floorStr ? gte(raids.date, floorStr) : undefined,
              lte(raids.date, asOfStr),
            ),
          )
      : [];

  const benchedRaidsByCharacterId = new Map<number, AttendedRaid[]>();
  for (const r of benchRows) {
    const entry: AttendedRaid = {
      raidId: r.raidId,
      characterId: r.characterId,
      zone: r.zone,
      class: classByCharacterId.get(r.characterId) ?? "Unknown",
      lockoutWeekStart: getTuesdayAnchoredWeekStart(raidDateToInstant(r.date)),
      startTime: raidDateToInstant(r.date),
      attendanceWeight: r.attendanceWeight,
    };
    const list = benchedRaidsByCharacterId.get(r.characterId) ?? [];
    list.push(entry);
    benchedRaidsByCharacterId.set(r.characterId, list);
  }

  // Every raid in range, regardless of attendance — the denominator Attendance Threshold needs
  // to stay a pure, context-only computation (see implementation-notes-phase-2.html) instead of
  // its own separate call to computeAttendance.
  const allRaidsInRangeRows = await db
    .select({ raidId: raids.raidId, date: raids.date })
    .from(raids)
    .where(and(floorStr ? gte(raids.date, floorStr) : undefined, lte(raids.date, asOfStr)));
  const raidsInWindow = allRaidsInRangeRows.map((r) => ({
    raidId: r.raidId,
    startTime: raidDateToInstant(r.date),
  }));

  // Scoped by the link's own startTime, NOT by attendedRaids — Consistency/Flexibility need
  // signups for raids the family did (or didn't) attend and check that by cross-referencing this
  // same matchedSignups array against attendedRaids in each scorer, so signup resolution can't be
  // pre-limited to already-attended raids. (Bench Credit no longer reads matchedSignups at all —
  // it's scored off raid_bench_map/benchedRaids above; a Raid Helper "Bench" role signup is just
  // pre-raid intent, not the officer-granted credit the achievement actually means.) Computed once
  // for the whole batch, then grouped by matched primary character, since neither the link/history
  // fetch nor matchSignupsToCharacters' output depends on which family is asking.
  //
  // `allCharacters` (fetched once, above) is passed into every matchSignupsToCharacters call
  // below as `preloadedCharacters` — without it, the matcher re-queries the entire non-ignored
  // roster itself on EVERY call, once per snapshot-history row (links × checkpoints). A real
  // secondary cost (measured: ~40-50ms saved per avoided query across 106 calls in a dev-DB
  // profile), but not the dominant one — see evaluateAchievementsForFamilies' award-insert loop
  // for the actual bottleneck.
  const links = await db.query.raidSignupSnapshotLinks.findMany({
    where: and(
      windowFloor ? gte(raidSignupSnapshotLinks.startTime, windowFloor) : undefined,
      lte(raidSignupSnapshotLinks.startTime, asOf),
    ),
  });

  const signupsByPrimaryCharacterId = new Map<number, MatchedSignup[]>();
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
      const matchResults = await matchSignupsToCharacters(db, signupInputs, allCharacters);
      for (const result of matchResults) {
        if (result.matchedPrimaryCharacterId == null) continue;
        const bucket = classifyBucket(result);
        if (!bucket) continue;
        const entry: MatchedSignup = {
          raidId: link.raidId,
          signedUpCharacterId:
            result.matchedCharacter?.characterId ?? result.matchedPrimaryCharacterId,
          bucket,
          checkpointHoursBeforeStart: hours,
          raidStartTime: link.startTime,
        };
        const list = signupsByPrimaryCharacterId.get(result.matchedPrimaryCharacterId) ?? [];
        list.push(entry);
        signupsByPrimaryCharacterId.set(result.matchedPrimaryCharacterId, list);
      }
    }
  }

  for (const primaryCharacterId of primaryCharacterIds) {
    const familyCharacterIds = familyCharacterIdsByPrimary.get(primaryCharacterId) ?? [];
    if (familyCharacterIds.length === 0) {
      results.set(primaryCharacterId, {
        familyCharacterIds: [],
        attendedRaids: [],
        benchedRaids: [],
        matchedSignups: [],
        raidsInWindow: [],
      });
      continue;
    }
    const attendedRaids = familyCharacterIds.flatMap(
      (id) => attendedRaidsByCharacterId.get(id) ?? [],
    );
    const benchedRaids = familyCharacterIds.flatMap(
      (id) => benchedRaidsByCharacterId.get(id) ?? [],
    );
    const matchedSignups = signupsByPrimaryCharacterId.get(primaryCharacterId) ?? [];
    results.set(primaryCharacterId, {
      familyCharacterIds,
      attendedRaids,
      benchedRaids,
      matchedSignups,
      raidsInWindow,
    });
  }

  return results;
}

/**
 * Single-family convenience wrapper over `buildRuleEvaluationContextsForFamilies`. Used by
 * tests and any call site that only has one family in hand — still pays the full shared-facts
 * cost on every call, so prefer the batched form when evaluating more than one family at once.
 */
export async function buildRuleEvaluationContext(
  db: DB,
  primaryCharacterId: number,
  windowFloor: Date | null,
  asOf: Date,
): Promise<RuleEvaluationContext> {
  const contexts = await buildRuleEvaluationContextsForFamilies(
    db,
    [primaryCharacterId],
    windowFloor,
    asOf,
  );
  return (
    contexts.get(primaryCharacterId) ?? {
      familyCharacterIds: [],
      attendedRaids: [],
      benchedRaids: [],
      matchedSignups: [],
      raidsInWindow: [],
    }
  );
}

// ─── Scoring: Weighted Attendance Threshold ────────────────────────────────────

/** Real per-raid `attendanceWeight` credit, matching the dashboard's own
 *  `views.primary_raid_attendance_l6lockoutwk` formula (apps/web/drizzle/0001_init_6w_reporting_views.sql):
 *  per lockout week, per zone, take the best-weighted raid attended OR bench-credited that week in
 *  that zone (dedupes a same-zone re-log within one week rather than double-counting it, and a
 *  raid the family was both logged AND benched for isn't double-counted either — same underlying
 *  `attendanceWeight`, so the per-zone max collapses it to one), sum across zones, cap the week's
 *  total at `WEIGHTED_ATTENDANCE_WEEKLY_CAP` (3 — Naxx/AQ40/BWL = 1 each, Molten Core = 0.5, so 3
 *  zones plus MC in one week already exceeds the cap), then sum across weeks. The percent's
 *  denominator is `config.lockoutWeeks * 3` — a FIXED point cap, not actual-elapsed-weeks-since-
 *  season-start, so a season that's only run 3 of a tier's 6 lockoutWeeks doesn't inflate the
 *  percentage by shrinking the denominator to match (confirmed design: eval against the full
 *  target lookback's point cap even when season start truncates it). Matches the dashboard's own
 *  `primary_raid_attendee_and_bench_map` source in every respect except the window itself — see
 *  `lockoutFloorFor`'s doc comment for why this treats the current, still-open lockout week as
 *  live instead of waiting for it to fully close like the dashboard view does. */
function scoreWeightedAttendanceThreshold(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "weighted_attendance_threshold" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const bestWeightByWeek = new Map<number, Map<string, number>>();
  for (const r of [...context.attendedRaids, ...context.benchedRaids]) {
    if (!withinWindow(r.startTime, window)) continue;
    const weekKey = r.lockoutWeekStart.getTime();
    const byZone = bestWeightByWeek.get(weekKey) ?? new Map<string, number>();
    const existing = byZone.get(r.zone);
    if (existing === undefined || r.attendanceWeight > existing) {
      byZone.set(r.zone, r.attendanceWeight);
    }
    bestWeightByWeek.set(weekKey, byZone);
  }
  let earned = 0;
  for (const byZone of bestWeightByWeek.values()) {
    const weekTotal = [...byZone.values()].reduce((sum, w) => sum + w, 0);
    earned += Math.min(weekTotal, WEIGHTED_ATTENDANCE_WEEKLY_CAP);
  }
  const target = config.lockoutWeeks * WEIGHTED_ATTENDANCE_WEEKLY_CAP;
  const percent = target === 0 ? 0 : Math.round((earned / target) * 100);
  return {
    crossed: percent >= config.minPercent,
    progress: { current: percent, target: config.minPercent },
  };
}

// ─── Scoring: the remaining 9 shapes (all pure — no DB access) ─────────────────

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
        // character that signed up for it. Requiring the signed-up character's OWN absence (not
        // just "some other id is present") matters: the signed-up character can attend alongside
        // a second family member in the same raid, and that's not a swap — a `.some(id !== x)`
        // check is true in that case too, which credited "Flexible" for a raid nobody swapped on.
        const attendees = attendedCharacterIdsByRaid.get(s.raidId);
        return !!attendees && !attendees.has(s.signedUpCharacterId);
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
  // Sourced from raid_bench_map (context.benchedRaids), NOT Raid Helper "Bench" role signups —
  // those are just pre-raid intent and are a different signal from the officer-granted credit this
  // achievement means (see the raid detail page's Bench panel: "earn the same credit as
  // attendees"). Deduped by raidId in case a character was ever double-entered for one raid.
  const count = new Set(
    context.benchedRaids.filter((r) => withinWindow(r.startTime, window)).map((r) => r.raidId),
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

/** Same pattern as scoreZoneAttendanceThreshold, keyed by class instead of zone — cheap to add
 *  since `AttendedRaid.class` is already populated from the character roster for every other
 *  class-aware shape (class_breadth_window). */
function scoreClassAttendanceThreshold(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "class_attendance_threshold" }>,
  window: EvaluationWindow,
): EvaluationResult {
  const count = new Set(
    context.attendedRaids
      .filter((r) => withinWindow(r.startTime, window) && r.class === config.class)
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
    case "weighted_attendance_threshold":
      return scoreWeightedAttendanceThreshold(context, config, window);
    case "consistency_match":
      return scoreConsistencyMatch(context, config, window);
    case "flexibility_match":
      return scoreFlexibilityMatch(context, config, window);
    case "bench_credit_count":
      return scoreBenchCreditCount(context, config, window);
    case "zone_attendance_threshold":
      return scoreZoneAttendanceThreshold(context, config, window);
    case "class_attendance_threshold":
      return scoreClassAttendanceThreshold(context, config, window);
    case "raid_marathon_density":
      return scoreRaidMarathonDensity(context, config, window);
    case "zone_breadth_window":
      return scoreZoneBreadthWindow(context, config, window);
    case "class_breadth_window":
      return scoreClassBreadthWindow(context, config, window);
    case "family_double_up_cooccurrence":
      return scoreFamilyDoubleUpCooccurrence(context, config, window);
    case "recipe_set_threshold":
      throw new Error("recipe_set_threshold is handled by scoreByShape, not scoreByShapeSync");
  }
}

/** Family (primary + secondaries) recipe knowledge — a direct DB query, not the shared
 *  RuleEvaluationContext (which is entirely raid/attendance-shaped and has nothing to do with
 *  recipes). `selectDistinct` guards against double-counting: the same recipeSpellId can
 *  legitimately appear once per family member who knows it. */
async function scoreRecipeSetThreshold(
  db: DB,
  primaryCharacterId: number,
  config: Extract<AchievementRuleConfig, { shape: "recipe_set_threshold" }>,
): Promise<EvaluationResult> {
  const familyCharacters = await db
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(
      or(
        eq(characters.characterId, primaryCharacterId),
        eq(characters.primaryCharacterId, primaryCharacterId),
      ),
    );
  const familyCharacterIds = familyCharacters.map((c) => c.characterId);
  if (familyCharacterIds.length === 0) {
    return { crossed: false, progress: { current: 0, target: config.minCount } };
  }

  const known = await db
    .selectDistinct({ recipeSpellId: characterRecipeMap.recipeSpellId })
    .from(characterRecipeMap)
    .where(
      and(
        inArray(characterRecipeMap.characterId, familyCharacterIds),
        inArray(characterRecipeMap.recipeSpellId, config.recipeSpellIds),
      ),
    );

  const current = known.length;
  return { crossed: current >= config.minCount, progress: { current, target: config.minCount } };
}

/** Single dispatch point every caller (orchestrator, progress lookups, tests) goes through — a
 *  new achievement reusing an existing shape needs zero changes here, only a new
 *  achievement-definitions.ts entry (see extensibility criterion). Declared async (though every
 *  other shape is pure) so a shape needing real I/O doesn't force a signature change on every
 *  existing call site — recipe_set_threshold is that shape: it queries character_spells directly
 *  and bypasses scoreByShapeSync/RuleEvaluationContext entirely. */
export async function scoreByShape(
  db: DB,
  primaryCharacterId: number,
  context: RuleEvaluationContext,
  config: AchievementRuleConfig,
  window: EvaluationWindow,
): Promise<EvaluationResult> {
  if (config.shape === "recipe_set_threshold") {
    return scoreRecipeSetThreshold(db, primaryCharacterId, config);
  }
  return scoreByShapeSync(context, config, window);
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────

export interface NewAward {
  achievementTierId: string;
  primaryCharacterId: number;
}

export type FamilyEvaluationResult = { newAwards: NewAward[] } | { error: unknown };

/**
 * The real orchestrator — evaluates a batch of families in one pass, fetching every
 * family-independent fact (tier configs, character roster, signup-link matching) exactly once
 * regardless of batch size. `evaluateAchievementsForFamily` (singular) below is a thin
 * one-element wrapper over this, not the other way around: the singular form was the original
 * shape, but its internals (via buildRuleEvaluationContext) redid a full character-roster fetch
 * and signup-matching pass per family, which is fine at the ~20-40 families a single raid's
 * QStash trigger evaluates but not at guild-backfill scale. Prefer this whenever more than one
 * family needs evaluating together — a raid's full attendee list, a manual backfill, etc.
 *
 * Each family's tier-scoring/award-insert step is isolated in its own try/catch so one family's
 * failure (e.g. a malformed signup snapshot) doesn't take down the rest of the batch — the
 * shared-facts fetch itself is common infrastructure and is allowed to fail the whole batch if
 * it breaks, same as before.
 */
export async function evaluateAchievementsForFamilies(
  db: DB,
  primaryCharacterIds: number[],
  asOf: Date,
): Promise<Map<number, FamilyEvaluationResult>> {
  const results = new Map<number, FamilyEvaluationResult>();
  if (primaryCharacterIds.length === 0) return results;

  // recipe_set_threshold is deliberately excluded here — it's the one shape that bypasses
  // RuleEvaluationContext and does its own real DB query per family (see scoreRecipeSetThreshold's
  // doc comment), so including it means every raid-import hook call (and, at guild-backfill scale,
  // every family in the guild) re-scores recipe knowledge that a raid log can't possibly change.
  // evaluateRecipeAchievementsForFamilies (below) is the dedicated path for recipe-shaped tiers,
  // triggered by addRecipeToCharacter instead. Measured cost of not excluding this: ~20 minutes
  // for a ~1100-family guild backfill, almost entirely this redundant per-family recipe query.
  const tiers = (
    await db.query.achievementTiers.findMany({
      where: (tier, { isNotNull }) => isNotNull(tier.ruleConfig),
      with: { achievement: { with: { season: true } } },
    })
  ).filter((t) => t.achievement.ruleShape !== "recipe_set_threshold");

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

  const contexts = await buildRuleEvaluationContextsForFamilies(
    db,
    primaryCharacterIds,
    widestFloor,
    asOf,
  );
  const emptyContext: RuleEvaluationContext = {
    familyCharacterIds: [],
    attendedRaids: [],
    benchedRaids: [],
    matchedSignups: [],
    raidsInWindow: [],
  };

  // A tier stays "crossed" forever once a family passes its threshold (nothing un-crosses a
  // count-based or attendance-based rule), so on any evaluation after the first, most of a
  // mature family's tiers are already awarded and `result.crossed` is true again for every one
  // of them — the old code re-issued an INSERT ... ON CONFLICT DO NOTHING round trip for every
  // single one of those, relying on the DB to no-op it. Measured against a real 58-family batch
  // in dev, that was ~550 wasted insert round trips (~20s of a ~25s total evaluation) for a
  // batch that produced zero new awards. Pre-fetching the batch's existing award keys once and
  // skipping the insert in-memory when a tier's already held cuts that down to one query plus
  // only the inserts that can actually be new.
  const existingAwardRows = await db.query.achievementAwards.findMany({
    where: inArray(achievementAwards.primaryCharacterId, primaryCharacterIds),
    columns: { achievementTierId: true, primaryCharacterId: true },
  });
  const alreadyAwardedKeys = new Set(
    existingAwardRows.map((a) => `${a.achievementTierId}:${a.primaryCharacterId}`),
  );

  for (const primaryCharacterId of primaryCharacterIds) {
    try {
      const context = contexts.get(primaryCharacterId) ?? emptyContext;
      const newAwards: NewAward[] = [];
      for (const tier of tiers) {
        const config = tier.ruleConfig as AchievementRuleConfig;
        const window = resolveEvaluationWindow(
          tier.achievement.scope,
          tier.achievement.season?.startDate ?? null,
          tier.achievement.season?.endDate ?? null,
          config.lockoutWeeks,
          asOf,
        );
        const result = await scoreByShape(db, primaryCharacterId, context, config, window);
        if (!result.crossed) continue;
        if (alreadyAwardedKeys.has(`${tier.id}:${primaryCharacterId}`)) continue;

        // onConflictDoNothing stays as a safety net for a real race (e.g. two raid triggers
        // evaluating the same family concurrently) — alreadyAwardedKeys only rules out the
        // common case of an already-settled prior award, not an in-flight one.
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
      results.set(primaryCharacterId, { newAwards });
    } catch (error) {
      results.set(primaryCharacterId, { error });
    }
  }

  return results;
}

/** Shape-scoped sibling of `evaluateAchievementsForFamilies`, batched the same way: fetches every
 *  family-independent fact (recipe-shaped tiers, the whole batch's existing awards) exactly once
 *  regardless of batch size, then loops only the genuinely per-family work (the recipe-knowledge
 *  count itself). Skips `buildRuleEvaluationContextsForFamilies` (the raid-attendance/signup-
 *  history context build) entirely — a recipe toggle can only ever move a recipe-shaped tier, so
 *  there is nothing for that context to contribute. Used by both the addRecipeToCharacter hook
 *  (one-element batch) and the tradeskill-tiers backfill script (every family at once) — the
 *  backfill originally looped the single-family form per family, which re-fetched tiers and
 *  existing awards on every iteration; this batched form is what fixes that. */
export async function evaluateRecipeAchievementsForFamilies(
  db: DB,
  primaryCharacterIds: number[],
  asOf: Date,
): Promise<Map<number, FamilyEvaluationResult>> {
  const results = new Map<number, FamilyEvaluationResult>();
  if (primaryCharacterIds.length === 0) return results;

  const tiers = await db.query.achievementTiers.findMany({
    where: (tier, { isNotNull }) => isNotNull(tier.ruleConfig),
    with: { achievement: true },
  });
  const recipeTiers = tiers.filter((t) => t.achievement.ruleShape === "recipe_set_threshold");
  if (recipeTiers.length === 0) {
    for (const id of primaryCharacterIds) results.set(id, { newAwards: [] });
    return results;
  }

  const existingAwardRows = await db.query.achievementAwards.findMany({
    where: inArray(achievementAwards.primaryCharacterId, primaryCharacterIds),
    columns: { achievementTierId: true, primaryCharacterId: true },
  });
  const alreadyAwardedKeys = new Set(
    existingAwardRows.map((a) => `${a.achievementTierId}:${a.primaryCharacterId}`),
  );

  for (const primaryCharacterId of primaryCharacterIds) {
    try {
      const newAwards: NewAward[] = [];
      for (const tier of recipeTiers) {
        if (alreadyAwardedKeys.has(`${tier.id}:${primaryCharacterId}`)) continue;
        const config = tier.ruleConfig as Extract<
          AchievementRuleConfig,
          { shape: "recipe_set_threshold" }
        >;
        const result = await scoreRecipeSetThreshold(db, primaryCharacterId, config);
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
      results.set(primaryCharacterId, { newAwards });
    } catch (error) {
      results.set(primaryCharacterId, { error });
    }
  }

  return results;
}

/** Single-family convenience wrapper over `evaluateRecipeAchievementsForFamilies` — preserves a
 *  throw-on-error contract for the addRecipeToCharacter hook's one-family call site. Prefer the
 *  batched form directly when more than one family needs evaluating together (e.g. the backfill
 *  script). */
export async function evaluateRecipeAchievementsForFamily(
  db: DB,
  primaryCharacterId: number,
  asOf: Date,
): Promise<FamilyEvaluationResult> {
  const results = await evaluateRecipeAchievementsForFamilies(db, [primaryCharacterId], asOf);
  return results.get(primaryCharacterId) ?? { newAwards: [] };
}

/** Single-family convenience wrapper over `evaluateAchievementsForFamilies` — preserves the
 *  original throw-on-error contract for existing call sites/tests. Prefer the batched form
 *  directly when more than one family needs evaluating together. */
export async function evaluateAchievementsForFamily(
  db: DB,
  primaryCharacterId: number,
  asOf: Date,
): Promise<{ newAwards: NewAward[] }> {
  const results = await evaluateAchievementsForFamilies(db, [primaryCharacterId], asOf);
  const result = results.get(primaryCharacterId);
  if (!result) return { newAwards: [] };
  if ("error" in result) throw result.error;
  return result;
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

export interface NextTierProgress {
  nextTier: AchievementTierLevel;
  progress: { current: number; target: number };
}

/**
 * Batched counterpart to `getNextTierProgress` — computes next-tier progress for several
 * achievements at once, fetching the shared rule-evaluation context exactly once for this
 * family regardless of how many achievements are asked about. `getDisplayCatalog` used to call
 * `getNextTierProgress` once per visible achievement (13, in the current seed), each one
 * independently rebuilding the full character-roster + signup-matching context from scratch —
 * the same N+1 shape `evaluateAchievementsForFamilies` fixes on the write side, just triggered
 * by a single person's page load instead of a guild-wide backfill. See the achievement-engine
 * QA log.
 */
export async function getNextTierProgressForAchievements(
  db: DB,
  primaryCharacterId: number,
  achievementIds: string[],
  asOf: Date,
): Promise<Map<string, NextTierProgress | null>> {
  const results = new Map<string, NextTierProgress | null>();
  if (achievementIds.length === 0) return results;

  const tiers = await db.query.achievementTiers.findMany({
    where: inArray(achievementTiers.achievementId, achievementIds),
    with: { achievement: { with: { season: true } } },
  });

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

  const tiersByAchievement = new Map<string, typeof tiers>();
  for (const tier of tiers) {
    const list = tiersByAchievement.get(tier.achievementId) ?? [];
    list.push(tier);
    tiersByAchievement.set(tier.achievementId, list);
  }

  // The next un-awarded tier with a real rule config, per achievement — maxed-out and
  // manual-only achievements contribute nothing here and resolve to `null` below.
  const nextTierByAchievement = new Map<string, (typeof tiers)[number]>();
  for (const [achievementId, achievementTiersList] of tiersByAchievement) {
    const ordered = [...achievementTiersList].sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.tier as AchievementTierLevel) -
        TIER_ORDER.indexOf(b.tier as AchievementTierLevel),
    );
    const next = ordered.find((t) => !awardedTierIds.has(t.id));
    if (next?.ruleConfig) nextTierByAchievement.set(achievementId, next);
  }

  const candidateTiers = [...nextTierByAchievement.values()];
  if (candidateTiers.length === 0) {
    // Every requested achievement is either maxed out or manual-only — nothing left to score,
    // so there's no reason to pay for a rule-evaluation context at all.
    for (const achievementId of achievementIds) results.set(achievementId, null);
    return results;
  }
  const lockoutWeeksValues = candidateTiers
    .map((t) => (t.ruleConfig as AchievementRuleConfig).lockoutWeeks)
    .filter((v): v is number => typeof v === "number");
  const widestLockoutWeeks =
    lockoutWeeksValues.length > 0 ? Math.max(...lockoutWeeksValues) : undefined;
  const anyUnbounded = candidateTiers.some((t) => {
    const config = t.ruleConfig as AchievementRuleConfig;
    return t.achievement.scope === "all_time" && !config.lockoutWeeks;
  });
  const widestFloor = anyUnbounded
    ? null
    : widestLockoutWeeks
      ? lockoutFloorFor(widestLockoutWeeks, asOf)
      : null;

  const context = await buildRuleEvaluationContext(db, primaryCharacterId, widestFloor, asOf);

  for (const achievementId of achievementIds) {
    const next = nextTierByAchievement.get(achievementId);
    if (!next) {
      results.set(achievementId, null);
      continue;
    }
    const config = next.ruleConfig as AchievementRuleConfig;
    const window = resolveEvaluationWindow(
      next.achievement.scope,
      next.achievement.season?.startDate ?? null,
      next.achievement.season?.endDate ?? null,
      config.lockoutWeeks,
      asOf,
    );
    const result = await scoreByShape(db, primaryCharacterId, context, config, window);
    results.set(achievementId, {
      nextTier: next.tier as AchievementTierLevel,
      progress: result.progress,
    });
  }

  return results;
}

/** Single-achievement convenience wrapper over `getNextTierProgressForAchievements` — prefer
 *  the batched form directly when checking progress on more than one achievement at once (e.g.
 *  a whole display catalog), since this still pays the full shared-context cost on every call. */
export async function getNextTierProgress(
  db: DB,
  primaryCharacterId: number,
  achievementId: string,
  asOf: Date,
): Promise<NextTierProgress | null> {
  const results = await getNextTierProgressForAchievements(
    db,
    primaryCharacterId,
    [achievementId],
    asOf,
  );
  return results.get(achievementId) ?? null;
}
