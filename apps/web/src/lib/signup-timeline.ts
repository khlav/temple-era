import {
  CHECKPOINT_OFFSET_HOURS,
  SNAPSHOT_CHECKPOINTS,
  type SnapshotCheckpoint,
} from "~/server/services/raid-helper-snapshot-checkpoints";
import { inferTalentRole, type TalentRole } from "~/lib/class-specs";
import { ABSENT_SIGNUP_CLASS_NAMES, BENCH_SIGNUP_CLASS_NAME } from "~/lib/raid-signup-status";

// resolveClassName/WOW_CLASSES/TANK_SPEC_TO_CLASS are intentionally re-declared here rather
// than imported from ~/server/api/helpers/match-signups.ts (already duplicated a second time
// in app/api/v1/scheduled-raids/route.ts for the same reason): that module pulls in
// ~/server/db/schema, and this file is imported by a client component (signup-timeline-tab.tsx)
// via ~/lib, so it needs to stay dependency-free of anything server-only.
const WOW_CLASSES = new Set([
  "druid",
  "hunter",
  "mage",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
]);
const SKIP_CLASS_NAMES = new Set(["bench", "tentative", "absent", "absence", "late"]);
const TANK_SPEC_TO_CLASS: Record<string, string> = {
  guardian: "Druid",
  protection: "Warrior",
};

function resolveClassName(className: string, specName?: string): string | null {
  const lc = className.toLowerCase();
  if (SKIP_CLASS_NAMES.has(lc)) return null;
  if (WOW_CLASSES.has(lc)) return lc.charAt(0).toUpperCase() + lc.slice(1);
  if (lc === "tank" && specName) return TANK_SPEC_TO_CLASS[specName.toLowerCase()] ?? null;
  return null;
}

/**
 * TEMPLE-97 Signup Timeline tab. Pure derivation only — no DB, no React — so every
 * function here is unit-testable the same way raid-helper-snapshot-checkpoints.ts is.
 */

/** Structural subset of RaidHelperSignupSnapshotEntry — also satisfied by the live
 * `api.raidHelper.getEventDetails` signup shape, so the "Current" slot (pre-TEMPLE-96)
 * can flow through the same derivation functions as a captured snapshot. */
export interface TimelineSignupEntry {
  userId: string;
  name: string;
  className: string;
  specName: string;
  roleName: string;
}

const TENTATIVE_SIGNUP_CLASS_NAMES = new Set(["Tentative", "Late"]);

export type SignupBucket = "confirmed" | "bench" | "tentative" | "absent";

/**
 * Finer-grained than summarizeSignupCounts (raid-signup-status.ts), which is deliberately
 * a simple confirmed/bench split for the header badge (TEMPLE-95) and folds Tentative/Late
 * into "confirmed". This tab's design calls out tentative as its own bucket with its own
 * count, so it needs the 4-way split rather than that 2-way one.
 */
export function classifySignupBucket(className: string): SignupBucket {
  if (ABSENT_SIGNUP_CLASS_NAMES.has(className)) return "absent";
  if (className === BENCH_SIGNUP_CLASS_NAME) return "bench";
  if (TENTATIVE_SIGNUP_CLASS_NAMES.has(className)) return "tentative";
  return "confirmed";
}

export interface SignupBucketCounts {
  confirmed: number;
  bench: number;
  tentative: number;
  absent: number;
}

export function countSignupBuckets(signups: TimelineSignupEntry[]): SignupBucketCounts {
  const counts: SignupBucketCounts = { confirmed: 0, bench: 0, tentative: 0, absent: 0 };
  for (const signup of signups) counts[classifySignupBucket(signup.className)]++;
  return counts;
}

/**
 * Raid Helper's className is "Tank" (not a real class) for tank-role signups — the real
 * class only lives in specName (Protection/Guardian/etc, sometimes with a Raid-Helper-
 * appended disambiguator digit). resolveClassName (match-signups.ts) already handles this
 * exact translation for the header roleCounts/classCounts and the v1 API; reused as-is
 * here rather than re-deriving it, so this tab inherits the same (already-accepted)
 * Warrior/Paladin "Protection" ambiguity instead of guessing a new answer.
 */
export function resolveSignupClass(signup: TimelineSignupEntry): string | null {
  const strippedSpec = signup.specName.replace(/[0-9]/g, "");
  return resolveClassName(signup.className, strippedSpec);
}

export type TimelineRoleName = "Tanks" | "Melee" | "Ranged" | "Healers";
export const TIMELINE_ROLE_ORDER: TimelineRoleName[] = ["Tanks", "Melee", "Ranged", "Healers"];

const ROLE_NAME_ALIASES: Record<string, TimelineRoleName> = {
  Tanks: "Tanks",
  Tank: "Tanks",
  Melee: "Melee",
  Ranged: "Ranged",
  Healers: "Healers",
  Healer: "Healers",
};

const TALENT_ROLE_TO_LABEL: Record<TalentRole, TimelineRoleName> = {
  Tank: "Tanks",
  Melee: "Melee",
  Ranged: "Ranged",
  Healer: "Healers",
};

/**
 * Raid Helper already assigns each signup a roleName (Tanks/Melee/Ranged/Healers) based on
 * the role button the signer picked — trusted directly rather than re-inferred, since it
 * already reflects the signer's actual choice (a hybrid class like Druid/Shaman/Paladin
 * can occupy more than one of these rows, which a single per-class default couldn't get
 * right). inferTalentRole is only a fallback for the rare row missing/with an unrecognized
 * roleName.
 */
export function resolveSignupRole(
  signup: TimelineSignupEntry,
  resolvedClass: string | null,
): TimelineRoleName {
  const aliased = ROLE_NAME_ALIASES[signup.roleName];
  if (aliased) return aliased;
  if (resolvedClass) {
    const strippedSpec = signup.specName.replace(/[0-9]/g, "");
    return TALENT_ROLE_TO_LABEL[inferTalentRole(resolvedClass, strippedSpec)];
  }
  return "Melee";
}

export type SignupChangeState = "held" | "new" | "moved" | "classSwitch" | "gone";

export interface SignupStateInfo {
  state: SignupChangeState;
  from?: TimelineSignupEntry;
}

export interface SignupDiff {
  arrivals: TimelineSignupEntry[];
  departures: TimelineSignupEntry[];
  moves: Array<{ signup: TimelineSignupEntry; from: TimelineSignupEntry }>;
  classSwitches: Array<{ signup: TimelineSignupEntry; from: TimelineSignupEntry }>;
}

/**
 * Paired on userId, not name (names are display strings Raid Helper reports verbatim and
 * can change; userId is stable). `prev = []` is a legitimate input, not an error case — it
 * means "no earlier captured checkpoint to compare against" and makes every entry in
 * `next` an arrival, which is what "first captured checkpoint" should show.
 */
export function diffSnapshots(
  prev: TimelineSignupEntry[],
  next: TimelineSignupEntry[],
): SignupDiff {
  const prevById = new Map(prev.map((s) => [s.userId, s]));
  const nextIds = new Set(next.map((s) => s.userId));

  const arrivals: TimelineSignupEntry[] = [];
  const moves: SignupDiff["moves"] = [];
  const classSwitches: SignupDiff["classSwitches"] = [];

  for (const signup of next) {
    const prior = prevById.get(signup.userId);
    if (!prior) {
      arrivals.push(signup);
      continue;
    }
    const priorBucket = classifySignupBucket(prior.className);
    const nextBucket = classifySignupBucket(signup.className);
    if (priorBucket !== nextBucket) {
      moves.push({ signup, from: prior });
    } else if (nextBucket === "confirmed" && prior.className !== signup.className) {
      classSwitches.push({ signup, from: prior });
    }
  }

  const departures = prev.filter((s) => !nextIds.has(s.userId));

  return { arrivals, departures, moves, classSwitches };
}

/** Per-signup change state relative to `prev`, keyed by userId — drives the dot / icon /
 * name-color vocabulary in the role breakdown and bucket rows. Includes departed signups
 * (state "gone") for callers building the change log. */
export function computeSignupStates(
  prev: TimelineSignupEntry[],
  next: TimelineSignupEntry[],
): Map<string, SignupStateInfo> {
  const diff = diffSnapshots(prev, next);
  const map = new Map<string, SignupStateInfo>();
  for (const signup of next) map.set(signup.userId, { state: "held" });
  for (const signup of diff.arrivals) map.set(signup.userId, { state: "new" });
  for (const { signup, from } of diff.moves) map.set(signup.userId, { state: "moved", from });
  for (const { signup, from } of diff.classSwitches)
    map.set(signup.userId, { state: "classSwitch", from });
  for (const signup of diff.departures) map.set(signup.userId, { state: "gone", from: signup });
  return map;
}

export interface TimelineSlot {
  checkpoint: SnapshotCheckpoint;
  /** Backed by a real DB snapshot row. */
  captured: boolean;
  /** The synthetic T-0h slot fed by a live Raid Helper fetch (pre-TEMPLE-96 only).
   * Display-only: excluded from diffs/deltas — see findPreviousCapturedIndex. */
  isLive: boolean;
  capturedAt: Date | null;
  signups: TimelineSignupEntry[];
  counts: SignupBucketCounts;
}

export interface TimelineSnapshotRow {
  checkpoint: SnapshotCheckpoint;
  capturedAt: Date;
  signups: TimelineSignupEntry[];
}

/** One slot per SNAPSHOT_CHECKPOINTS entry (144h → 0h), oldest first. Gaps (a checkpoint
 * never captured, e.g. a schedule created late) render as an uncaptured slot rather than
 * being omitted, so the rail always shows all seven positions. */
export function buildTimeline(
  rows: TimelineSnapshotRow[],
  live: TimelineSignupEntry[] | null,
): TimelineSlot[] {
  const byCheckpoint = new Map(rows.map((row) => [row.checkpoint, row]));

  return SNAPSHOT_CHECKPOINTS.map((checkpoint) => {
    const row = byCheckpoint.get(checkpoint);
    if (row) {
      return {
        checkpoint,
        captured: true,
        isLive: false,
        capturedAt: row.capturedAt,
        signups: row.signups,
        counts: countSignupBuckets(row.signups),
      };
    }
    if (checkpoint === "0h" && live) {
      return {
        checkpoint,
        captured: false,
        isLive: true,
        capturedAt: null,
        signups: live,
        counts: countSignupBuckets(live),
      };
    }
    return {
      checkpoint,
      captured: false,
      isLive: false,
      capturedAt: null,
      signups: [],
      counts: { confirmed: 0, bench: 0, tentative: 0, absent: 0 },
    };
  });
}

/** Nearest earlier *captured* slot — skips gaps and never returns a live slot, since the
 * live slot is display-only and excluded from diff/delta arithmetic. */
export function findPreviousCapturedIndex(slots: TimelineSlot[], index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    if (slots[i]?.captured) return i;
  }
  return null;
}

export function checkpointTickLabel(checkpoint: SnapshotCheckpoint, isLive: boolean): string {
  if (checkpoint === "0h") return isLive ? "Current" : "Start";
  return `T-${CHECKPOINT_OFFSET_HOURS[checkpoint]}h`;
}

export interface CheckpointDelta {
  /** Confirmed arrivals: fresh signups + moves into the confirmed bucket. */
  confirmedGain: number;
  /** Bench arrivals: fresh signups + moves into the bench bucket. */
  benchGain: number;
  /** Confirmed departures: left the event entirely, or moved out of confirmed. */
  confirmedLoss: number;
}

/** null when `index` has no earlier captured checkpoint to compare against (the first
 * capture) — callers should render "—" rather than a zeroed delta in that case. */
export function computeCheckpointDelta(
  slots: TimelineSlot[],
  index: number,
): CheckpointDelta | null {
  const prevIndex = findPreviousCapturedIndex(slots, index);
  if (prevIndex === null) return null;

  const diff = diffSnapshots(slots[prevIndex]!.signups, slots[index]!.signups);
  const bucketOf = (s: TimelineSignupEntry) => classifySignupBucket(s.className);

  const confirmedGain =
    diff.arrivals.filter((s) => bucketOf(s) === "confirmed").length +
    diff.moves.filter((m) => bucketOf(m.signup) === "confirmed").length;
  const benchGain =
    diff.arrivals.filter((s) => bucketOf(s) === "bench").length +
    diff.moves.filter((m) => bucketOf(m.signup) === "bench").length;
  const confirmedLoss =
    diff.departures.filter((s) => bucketOf(s) === "confirmed").length +
    diff.moves.filter((m) => bucketOf(m.from) === "confirmed" && bucketOf(m.signup) !== "confirmed")
      .length;

  return { confirmedGain, benchGain, confirmedLoss };
}

/** Percentage-width basis for the rail bars — the busiest *captured* snapshot's
 * confirmed+bench+absent total, so every row's bar is comparable. Never zero. */
export function maxTimelineBarTotal(slots: TimelineSlot[]): number {
  let max = 1;
  for (const slot of slots) {
    if (!slot.captured) continue;
    const total = slot.counts.confirmed + slot.counts.bench + slot.counts.absent;
    if (total > max) max = total;
  }
  return max;
}

export interface RoleGroupMember {
  signup: TimelineSignupEntry;
  state: SignupChangeState;
  from?: TimelineSignupEntry;
}

export interface RoleGroupClass {
  className: string;
  members: RoleGroupMember[];
}

export interface RoleGroup {
  role: TimelineRoleName;
  members: RoleGroupMember[];
  byClass: RoleGroupClass[];
}

/** Groups *confirmed*-bucket signups by role then class. `states` should come from
 * computeSignupStates(prevCapturedSignups, signups) — pass an empty-map for "no comparison
 * available" (every member then defaults to "held"). */
export function groupByRole(
  signups: TimelineSignupEntry[],
  states: Map<string, SignupStateInfo>,
): RoleGroup[] {
  const byRole = new Map<TimelineRoleName, Map<string, RoleGroupMember[]>>(
    TIMELINE_ROLE_ORDER.map((role) => [role, new Map<string, RoleGroupMember[]>()]),
  );

  for (const signup of signups) {
    if (classifySignupBucket(signup.className) !== "confirmed") continue;
    const resolvedClass = resolveSignupClass(signup) ?? "Unknown";
    const role = resolveSignupRole(signup, resolvedClass === "Unknown" ? null : resolvedClass);
    const stateInfo = states.get(signup.userId) ?? { state: "held" as const };
    const classMap = byRole.get(role)!;
    const list = classMap.get(resolvedClass) ?? [];
    list.push({ signup, ...stateInfo });
    classMap.set(resolvedClass, list);
  }

  return TIMELINE_ROLE_ORDER.map((role) => {
    const classMap = byRole.get(role)!;
    const byClass = [...classMap.entries()]
      .map(([className, members]) => ({ className, members }))
      .sort((a, b) => b.members.length - a.members.length);
    return { role, members: byClass.flatMap((g) => g.members), byClass };
  });
}

/** Signups in one non-confirmed bucket ("bench" | "tentative" | "absent"), with change
 * state attached — feeds the Bench/Tentative/Absent cards. */
export function groupByBucket(
  signups: TimelineSignupEntry[],
  bucket: SignupBucket,
  states: Map<string, SignupStateInfo>,
): RoleGroupMember[] {
  return signups
    .filter((s) => classifySignupBucket(s.className) === bucket)
    .map((signup) => ({ signup, ...(states.get(signup.userId) ?? { state: "held" as const }) }));
}

export type ChangeLogKind = "New" | "Moved" | "Class switch" | "Left";

export interface ChangeLogRow {
  checkpoint: SnapshotCheckpoint;
  kind: ChangeLogKind;
  signup: TimelineSignupEntry;
  from?: TimelineSignupEntry;
}

/**
 * Every individual change across all *captured* checkpoints (never the live slot),
 * newest checkpoint first. A change is attributed to the checkpoint that first shows it —
 * see the tab's footnote — so this walks consecutive captured-checkpoint pairs rather than
 * trying to time-order within a gap.
 */
export function buildChangeLog(slots: TimelineSlot[]): ChangeLogRow[] {
  const rows: ChangeLogRow[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    if (!slot.captured) continue;
    const prevIndex = findPreviousCapturedIndex(slots, i);
    const prevSignups = prevIndex === null ? [] : slots[prevIndex]!.signups;
    const diff = diffSnapshots(prevSignups, slot.signups);

    for (const signup of diff.arrivals)
      rows.push({ checkpoint: slot.checkpoint, kind: "New", signup });
    for (const { signup, from } of diff.moves)
      rows.push({ checkpoint: slot.checkpoint, kind: "Moved", signup, from });
    for (const { signup, from } of diff.classSwitches)
      rows.push({ checkpoint: slot.checkpoint, kind: "Class switch", signup, from });
    for (const signup of diff.departures)
      rows.push({ checkpoint: slot.checkpoint, kind: "Left", signup });
  }

  const checkpointIndex = new Map(SNAPSHOT_CHECKPOINTS.map((cp, i) => [cp, i]));
  return rows.sort(
    (a, b) => checkpointIndex.get(b.checkpoint)! - checkpointIndex.get(a.checkpoint)!,
  );
}
