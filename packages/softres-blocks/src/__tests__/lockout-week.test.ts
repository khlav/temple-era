import { describe, expect, it } from "vitest";
import { formatLockoutWeekLabel, getEasternDayKey, getLockoutWeekKey } from "../lockout-week.js";

describe("getLockoutWeekKey", () => {
  it("returns the same Tuesday for every day within that lockout week", () => {
    // Tuesday 2026-09-08 ET through Monday 2026-09-14 ET should all resolve to "2026-09-08".
    const days = [
      "2026-09-08T12:00:00Z", // Tuesday
      "2026-09-10T03:00:00Z", // Wednesday, just past midnight ET
      "2026-09-13T23:00:00Z", // Sunday
      "2026-09-15T03:59:00Z", // still Monday in ET (before midnight ET rollover)
    ];
    for (const iso of days) {
      expect(getLockoutWeekKey(new Date(iso))).toBe("2026-09-08");
    }
  });

  it("rolls over to the next Tuesday once ET crosses into it", () => {
    expect(getLockoutWeekKey(new Date("2026-09-15T04:00:00Z"))).toBe("2026-09-15");
  });

  it("handles the November DST fall-back week correctly", () => {
    // 2026-11-01 is a Sunday ET; the US DST fall-back occurs that same night. The lockout
    // week containing it starts Tuesday 2026-10-27.
    expect(getLockoutWeekKey(new Date("2026-10-27T12:00:00Z"))).toBe("2026-10-27");
    expect(getLockoutWeekKey(new Date("2026-11-01T12:00:00Z"))).toBe("2026-10-27");
    expect(getLockoutWeekKey(new Date("2026-11-03T05:01:00Z"))).toBe("2026-11-03");
  });

  it("handles the March DST spring-forward week correctly", () => {
    // 2026-03-15 is a Sunday ET; DST begins that morning. The lockout week containing it
    // starts Tuesday 2026-03-10.
    expect(getLockoutWeekKey(new Date("2026-03-10T12:00:00Z"))).toBe("2026-03-10");
    expect(getLockoutWeekKey(new Date("2026-03-15T12:00:00Z"))).toBe("2026-03-10");
    expect(getLockoutWeekKey(new Date("2026-03-17T04:00:00Z"))).toBe("2026-03-17");
  });

  it("handles a year boundary", () => {
    // Tuesday 2025-12-30 ET starts a lockout week that spans into 2026.
    expect(getLockoutWeekKey(new Date("2025-12-30T12:00:00Z"))).toBe("2025-12-30");
    expect(getLockoutWeekKey(new Date("2026-01-04T12:00:00Z"))).toBe("2025-12-30");
    expect(getLockoutWeekKey(new Date("2026-01-06T05:00:00Z"))).toBe("2026-01-06");
  });
});

describe("getEasternDayKey", () => {
  it("returns the same day key for two instants on the same ET calendar day", () => {
    expect(getEasternDayKey(new Date("2026-09-15T23:00:00Z"))).toBe("2026-09-15"); // 7pm ET
    expect(getEasternDayKey(new Date("2026-09-16T03:59:00Z"))).toBe("2026-09-15"); // 11:59pm ET
  });

  it("rolls over at ET midnight, not UTC midnight", () => {
    expect(getEasternDayKey(new Date("2026-09-16T04:00:00Z"))).toBe("2026-09-16"); // 12:00am ET
  });
});

describe("formatLockoutWeekLabel", () => {
  it("formats a week key as a short human date", () => {
    expect(formatLockoutWeekLabel("2026-09-08")).toBe("Sep 8");
  });

  it("formats correctly across a year boundary", () => {
    expect(formatLockoutWeekLabel("2025-12-30")).toBe("Dec 30");
  });
});
