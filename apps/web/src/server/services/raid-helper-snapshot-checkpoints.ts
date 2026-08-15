export const SNAPSHOT_CHECKPOINTS = ["144h", "120h", "96h", "72h", "48h", "24h", "0h"] as const;
export type SnapshotCheckpoint = (typeof SNAPSHOT_CHECKPOINTS)[number];

export const CHECKPOINT_OFFSET_HOURS: Record<SnapshotCheckpoint, number> = {
  "144h": 144,
  "120h": 120,
  "96h": 96,
  "72h": 72,
  "48h": 48,
  "24h": 24,
  "0h": 0,
};

/**
 * Outage backstop only — NOT delivery-jitter tolerance (QStash's own retries handle
 * that; see decideCheckpointAction's match/due-grace branch, which deliberately no-ops
 * rather than double-capturing). If the discovery poll itself stops firing for less than
 * ~90 min, the next successful poll still finds a correctly-scheduled/due message and
 * does nothing wrong. Beyond that, give up rather than firing something hours stale.
 */
export const GRACE_WINDOW_MS = 90 * 60 * 1000;

export function computeTargetTime(startTime: Date, checkpoint: SnapshotCheckpoint): Date {
  return new Date(startTime.getTime() - CHECKPOINT_OFFSET_HOURS[checkpoint] * 60 * 60 * 1000);
}

export interface ScheduledState {
  qstashMessageId: string;
  /** The event's startTime as assumed when this message was scheduled. */
  scheduledForStartTime: Date;
}

export interface CheckpointDecisionInput {
  checkpoint: SnapshotCheckpoint;
  now: Date;
  /** The event's startTime as reported by the *current* discovery poll. */
  currentStartTime: Date;
  /** Does a snapshot row already exist for (event, checkpoint)? */
  captured: boolean;
  /** Current pending-QStash-message tracking row for (event, checkpoint), if any. */
  scheduled: ScheduledState | null;
}

export type CheckpointDecision =
  | { action: "skip-captured"; staleSchedule: ScheduledState | null }
  | { action: "skip-missed"; targetTime: Date; staleSchedule: ScheduledState | null }
  | { action: "capture-now"; targetTime: Date; staleSchedule: ScheduledState | null }
  | { action: "schedule"; targetTime: Date }
  | { action: "reschedule"; targetTime: Date; staleSchedule: ScheduledState }
  | { action: "noop"; targetTime: Date };

/**
 * Pure: decides what to do about one (event, checkpoint) pair given its current state.
 * No DB or network access. Timing is always computed against the event's *current*
 * startTime, so a scheduled/current mismatch (row 8-10) evaluates against the corrected
 * target, not the stale one.
 *
 * Decision table (also documented in the TEMPLE-76 plan):
 *  1. captured=true, any                        -> skip-captured (repairs a leftover
 *     tracking row if one survived a partial failure)
 *  2. captured=false, scheduled=null, future     -> schedule
 *  3. captured=false, scheduled=null, due-grace  -> capture-now (nothing was ever
 *     scheduled, e.g. a prior publish failed, but still within the grace window)
 *  4. captured=false, scheduled=null, missed     -> skip-missed (give up permanently)
 *  5. captured=false, scheduled=match, future    -> noop
 *  6. captured=false, scheduled=match, due-grace -> noop (trust QStash's own retry
 *     rather than double-capturing)
 *  7. captured=false, scheduled=match, missed    -> skip-missed (+staleSchedule; QStash's
 *     retries presumed exhausted, best-effort cancel and give up)
 *  8. captured=false, scheduled=mismatch, future -> reschedule (the motivating same-day
 *     raid-move case: cancel the old message, publish a new one at the corrected time)
 *  9. captured=false, scheduled=mismatch, due-grace -> capture-now (+staleSchedule; raid
 *     moved earlier, corrected target is already due)
 * 10. captured=false, scheduled=mismatch, missed -> skip-missed (+staleSchedule; raid
 *     moved enough that even the corrected target is stale)
 */
export function decideCheckpointAction(input: CheckpointDecisionInput): CheckpointDecision {
  const { checkpoint, now, currentStartTime, captured, scheduled } = input;
  const targetTime = computeTargetTime(currentStartTime, checkpoint);

  if (captured) {
    return { action: "skip-captured", staleSchedule: scheduled };
  }

  const nowMs = now.getTime();
  const targetMs = targetTime.getTime();
  const timing: "future" | "due-grace" | "missed" =
    nowMs < targetMs ? "future" : nowMs <= targetMs + GRACE_WINDOW_MS ? "due-grace" : "missed";

  if (scheduled === null) {
    if (timing === "future") return { action: "schedule", targetTime };
    if (timing === "due-grace") return { action: "capture-now", targetTime, staleSchedule: null };
    return { action: "skip-missed", targetTime, staleSchedule: null };
  }

  const isMatch = scheduled.scheduledForStartTime.getTime() === currentStartTime.getTime();

  if (isMatch) {
    if (timing === "future" || timing === "due-grace") return { action: "noop", targetTime };
    return { action: "skip-missed", targetTime, staleSchedule: scheduled };
  }

  if (timing === "future") return { action: "reschedule", targetTime, staleSchedule: scheduled };
  if (timing === "due-grace")
    return { action: "capture-now", targetTime, staleSchedule: scheduled };
  return { action: "skip-missed", targetTime, staleSchedule: scheduled };
}
