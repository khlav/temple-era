import { describe, expect, it } from "vitest";
import {
  nextTuesdayAtEasternTime,
  hasAssignmentOnSameEasternDate,
  computeDefaultScheduledAt,
} from "~/lib/world-buff-schedule-defaults";

// All "now" fixtures are given as UTC instants; comments note the corresponding Eastern time.
describe("nextTuesdayAtEasternTime", () => {
  it("jumps to next Tuesday when today is Wednesday ET", () => {
    // Wed 2026-08-12 15:00 UTC = Wed 2026-08-12 11:00 ET
    const now = new Date("2026-08-12T15:00:00Z");
    const result = nextTuesdayAtEasternTime(19, 0, now);
    expect(result.toISOString()).toBe("2026-08-18T23:00:00.000Z"); // Tue 2026-08-18 19:00 ET (EDT, UTC-4)
  });

  it("stays on today when it's Tuesday ET and before the target time", () => {
    // Tue 2026-08-18 15:00 UTC = Tue 2026-08-18 11:00 ET, target is 19:00 ET (not yet passed)
    const now = new Date("2026-08-18T15:00:00Z");
    const result = nextTuesdayAtEasternTime(19, 0, now);
    expect(result.toISOString()).toBe("2026-08-18T23:00:00.000Z");
  });

  it("rolls to next week when it's Tuesday ET but after the target time", () => {
    // Tue 2026-08-18 23:30 UTC = Tue 2026-08-18 19:30 ET, target 19:00 ET already passed
    const now = new Date("2026-08-18T23:30:00Z");
    const result = nextTuesdayAtEasternTime(19, 0, now);
    expect(result.toISOString()).toBe("2026-08-25T23:00:00.000Z");
  });
});

describe("hasAssignmentOnSameEasternDate", () => {
  it("matches an instant on the same Eastern calendar date", () => {
    const target = new Date("2026-08-18T23:00:00Z"); // Tue 19:00 ET
    const existing = [new Date("2026-08-18T17:30:00Z")]; // same Tue, 13:30 ET
    expect(hasAssignmentOnSameEasternDate(target, existing)).toBe(true);
  });

  it("does not match a different Eastern calendar date", () => {
    const target = new Date("2026-08-18T23:00:00Z");
    const existing = [new Date("2026-08-19T23:00:00Z")];
    expect(hasAssignmentOnSameEasternDate(target, existing)).toBe(false);
  });
});

describe("computeDefaultScheduledAt", () => {
  it("returns the computed default when nothing else is scheduled for that buff", () => {
    const now = new Date("2026-08-12T15:00:00Z");
    const result = computeDefaultScheduledAt(19, 0, [], now);
    expect(result).not.toBe("");
  });

  it("rolls forward a week when the buff already has an assignment that day", () => {
    const now = new Date("2026-08-12T15:00:00Z");
    const existing = [new Date("2026-08-18T22:00:00Z")]; // same target Tuesday, different time
    const result = computeDefaultScheduledAt(19, 0, existing, now);
    expect(result).toBe("2026-08-25T19:00"); // following Tuesday, same 19:00 ET target time
  });

  it("keeps rolling forward past multiple consecutive conflicts", () => {
    const now = new Date("2026-08-12T15:00:00Z");
    const existing = [
      new Date("2026-08-18T23:00:00Z"), // Tue 2026-08-18 19:00 ET
      new Date("2026-08-25T23:00:00Z"), // Tue 2026-08-25 19:00 ET
    ];
    const result = computeDefaultScheduledAt(19, 0, existing, now);
    expect(result).toBe("2026-09-01T19:00"); // first free Tuesday
  });
});
