import { describe, it, expect } from "vitest";
import {
  decideCheckpointAction,
  computeTargetTime,
  GRACE_WINDOW_MS,
  CHECKPOINT_OFFSET_HOURS,
  type ScheduledState,
} from "../raid-helper-snapshot-checkpoints";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-08-16T00:00:00Z");

// All rows below use the "72h" checkpoint unless noted; startTime is derived from the
// desired targetTime so each test reads in terms of "how far the target is from now."
function startTimeForTarget(targetTime: Date): Date {
  return new Date(targetTime.getTime() + CHECKPOINT_OFFSET_HOURS["72h"] * HOUR_MS);
}

describe("computeTargetTime", () => {
  it("subtracts the checkpoint's offset from startTime", () => {
    const startTime = new Date("2026-08-20T18:00:00Z");
    expect(computeTargetTime(startTime, "72h")).toEqual(new Date("2026-08-17T18:00:00Z"));
    expect(computeTargetTime(startTime, "24h")).toEqual(new Date("2026-08-19T18:00:00Z"));
    expect(computeTargetTime(startTime, "0h")).toEqual(startTime);
  });
});

describe("decideCheckpointAction", () => {
  it("row 1: already captured -> skip-captured regardless of a pending schedule", () => {
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: startTimeForTarget(now),
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime: startTimeForTarget(now),
      captured: true,
      scheduled,
    });
    expect(decision).toEqual({ action: "skip-captured", staleSchedule: scheduled });
  });

  it("row 1b: already captured with no pending schedule -> skip-captured, staleSchedule null", () => {
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime: startTimeForTarget(now),
      captured: true,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "skip-captured", staleSchedule: null });
  });

  it("row 2: nothing scheduled, target in the future -> schedule", () => {
    const targetTime = new Date(now.getTime() + HOUR_MS);
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime: startTimeForTarget(targetTime),
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "schedule", targetTime });
  });

  it("row 3: nothing scheduled, target within grace -> capture-now", () => {
    const targetTime = new Date(now.getTime() - 30 * 60 * 1000);
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime: startTimeForTarget(targetTime),
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "capture-now", targetTime, staleSchedule: null });
  });

  it("row 4: nothing scheduled, target past grace -> skip-missed", () => {
    const targetTime = new Date(now.getTime() - GRACE_WINDOW_MS - 60 * 1000);
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime: startTimeForTarget(targetTime),
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "skip-missed", targetTime, staleSchedule: null });
  });

  it("row 5: correctly scheduled, target in the future -> noop", () => {
    const targetTime = new Date(now.getTime() + HOUR_MS);
    const currentStartTime = startTimeForTarget(targetTime);
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: currentStartTime,
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled,
    });
    expect(decision).toEqual({ action: "noop", targetTime });
  });

  it("row 6: correctly scheduled, target within grace -> noop (trust QStash's own retry)", () => {
    const targetTime = new Date(now.getTime() - 30 * 60 * 1000);
    const currentStartTime = startTimeForTarget(targetTime);
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: currentStartTime,
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled,
    });
    expect(decision).toEqual({ action: "noop", targetTime });
  });

  it("row 7: correctly scheduled, target past grace -> skip-missed, flags the dead message for cleanup", () => {
    const targetTime = new Date(now.getTime() - GRACE_WINDOW_MS - 60 * 1000);
    const currentStartTime = startTimeForTarget(targetTime);
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: currentStartTime,
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled,
    });
    expect(decision).toEqual({ action: "skip-missed", targetTime, staleSchedule: scheduled });
  });

  it("row 8: scheduled for a stale startTime, corrected target still future -> reschedule (the same-day-move case)", () => {
    const correctedTarget = new Date(now.getTime() + HOUR_MS);
    const currentStartTime = startTimeForTarget(correctedTarget);
    // Assumed startTime (at schedule time) was 1h earlier than the raid's new, later start.
    const staleStartTime = new Date(currentStartTime.getTime() - HOUR_MS);
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: staleStartTime,
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled,
    });
    expect(decision).toEqual({
      action: "reschedule",
      targetTime: correctedTarget,
      staleSchedule: scheduled,
    });
  });

  it("row 9: scheduled for a stale startTime, corrected target within grace -> capture-now (raid moved earlier)", () => {
    const correctedTarget = new Date(now.getTime() - 30 * 60 * 1000);
    const currentStartTime = startTimeForTarget(correctedTarget);
    const staleStartTime = new Date(currentStartTime.getTime() + 2 * HOUR_MS);
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: staleStartTime,
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled,
    });
    expect(decision).toEqual({
      action: "capture-now",
      targetTime: correctedTarget,
      staleSchedule: scheduled,
    });
  });

  it("row 10: scheduled for a stale startTime, corrected target past grace -> skip-missed", () => {
    const correctedTarget = new Date(now.getTime() - GRACE_WINDOW_MS - 60 * 1000);
    const currentStartTime = startTimeForTarget(correctedTarget);
    const staleStartTime = new Date(currentStartTime.getTime() + 3 * HOUR_MS);
    const scheduled: ScheduledState = {
      qstashMessageId: "msg1",
      scheduledForStartTime: staleStartTime,
    };
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled,
    });
    expect(decision).toEqual({
      action: "skip-missed",
      targetTime: correctedTarget,
      staleSchedule: scheduled,
    });
  });

  it("boundary: exactly at target time counts as due-grace, not future", () => {
    const currentStartTime = startTimeForTarget(now);
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "capture-now", targetTime: now, staleSchedule: null });
  });

  it("boundary: exactly at the grace-window edge still counts as due-grace", () => {
    const targetTime = new Date(now.getTime() - GRACE_WINDOW_MS);
    const currentStartTime = startTimeForTarget(targetTime);
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "capture-now", targetTime, staleSchedule: null });
  });

  it("boundary: one ms past the grace-window edge is missed", () => {
    const targetTime = new Date(now.getTime() - GRACE_WINDOW_MS - 1);
    const currentStartTime = startTimeForTarget(targetTime);
    const decision = decideCheckpointAction({
      checkpoint: "72h",
      now,
      currentStartTime,
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "skip-missed", targetTime, staleSchedule: null });
  });

  it("treats the 0h checkpoint the same as the offset checkpoints", () => {
    const decision = decideCheckpointAction({
      checkpoint: "0h",
      now,
      currentStartTime: now,
      captured: false,
      scheduled: null,
    });
    expect(decision).toEqual({ action: "capture-now", targetTime: now, staleSchedule: null });
  });
});
