import { afterEach, describe, expect, it, vi } from "vitest";

// Same reasoning as raid-signup-link-matching.test.ts: importing this module pulls in
// ~/server/db -> ~/env.js's real env validation, which CI's Test step runs without
// SKIP_ENV_VALIDATION. Mock the DB and the snapshot-query module this file reads
// through, rather than touching CI config for tests that don't need a real database.
// This file also imports ~/env directly (for DISCORD_SERVER_ID, in discordEventUrl), so
// that needs its own mock too — a fake value, just enough to build a real-looking URL.
function chainable<T>(rows: T[]): Promise<T[]> & { limit: (n: number) => Promise<T[]> } {
  const result = Promise.resolve(rows) as Promise<T[]> & { limit: (n: number) => Promise<T[]> };
  result.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return result;
}

const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("~/server/db", () => ({
  db: { select: mockSelect },
}));

vi.mock("~/env", () => ({ env: { DISCORD_SERVER_ID: "srv-123" } }));

const mockGetLatestSignupSnapshotForOccurrence = vi.fn();
const mockGetLatestSignupSnapshotsByOccurrence = vi.fn();
vi.mock("~/server/services/raid-helper-snapshot-queries", () => ({
  getLatestSignupSnapshotForOccurrence: mockGetLatestSignupSnapshotForOccurrence,
  getLatestSignupSnapshotsByOccurrence: mockGetLatestSignupSnapshotsByOccurrence,
}));

const { getSignupSnapshotForRaid, getSignupOccurrenceMetrics, getSignupVsRaidLogSummary } =
  await import("~/server/services/raid-signup-link-reporting");

afterEach(() => {
  vi.clearAllMocks();
});

describe("getSignupSnapshotForRaid", () => {
  it("returns undefined when the raid has no link", async () => {
    mockWhere.mockReturnValue(chainable([]));

    const result = await getSignupSnapshotForRaid(1);

    expect(result).toBeUndefined();
    expect(mockGetLatestSignupSnapshotForOccurrence).not.toHaveBeenCalled();
  });

  it("enriches the raid's link with its latest snapshot", async () => {
    const startTime = new Date("2026-01-20T20:00:00Z");
    mockWhere.mockReturnValue(
      chainable([
        {
          linkId: "link-1",
          source: "auto",
          confidence: 0.95,
          matchReason: {
            timingDeltaMinutes: 0,
            timingScore: 1,
            zoneScore: 1,
            zoneMatchQuality: "exact_softres",
          },
          raidHelperEventId: "evt-1",
          startTime,
        },
      ]),
    );
    const snapshot = { id: "snap-1", raidHelperEventId: "evt-1", startTime, signUpCount: 20 };
    mockGetLatestSignupSnapshotForOccurrence.mockResolvedValue(snapshot);

    const result = await getSignupSnapshotForRaid(1);

    expect(result?.linkId).toBe("link-1");
    expect(result?.snapshot).toBe(snapshot);
    expect(mockGetLatestSignupSnapshotForOccurrence).toHaveBeenCalledWith("evt-1", startTime);
  });
});

describe("getSignupOccurrenceMetrics", () => {
  it("returns nothing and skips the snapshot lookup when no links exist", async () => {
    mockWhere.mockReturnValue(Promise.resolve([]));

    const result = await getSignupOccurrenceMetrics();

    expect(result.occurrences).toEqual([]);
    expect(result.raidIdToOccurrenceKey.size).toBe(0);
    expect(mockGetLatestSignupSnapshotsByOccurrence).not.toHaveBeenCalled();
  });

  it("dedupes a doubleheader's shared occurrence into one metric attributing both raids", async () => {
    const startTime = new Date("2026-01-20T20:00:00Z");
    mockWhere.mockReturnValue(
      Promise.resolve([
        { raidId: 1, raidHelperEventId: "evt-1", startTime },
        { raidId: 2, raidHelperEventId: "evt-1", startTime },
      ]),
    );
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([
      { raidHelperEventId: "evt-1", startTime, signUpCount: 30 },
    ]);

    const result = await getSignupOccurrenceMetrics();

    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]?.signUpCount).toBe(30);
    expect(result.occurrences[0]?.raidIds.sort()).toEqual([1, 2]);
    expect(result.raidIdToOccurrenceKey.get(1)).toBe(result.raidIdToOccurrenceKey.get(2));
  });

  it("keeps distinct occurrences as separate metrics", async () => {
    const t1 = new Date("2026-01-20T20:00:00Z");
    const t2 = new Date("2026-01-27T20:00:00Z");
    mockWhere.mockReturnValue(
      Promise.resolve([
        { raidId: 1, raidHelperEventId: "evt-1", startTime: t1 },
        { raidId: 3, raidHelperEventId: "evt-2", startTime: t2 },
      ]),
    );
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([
      { raidHelperEventId: "evt-1", startTime: t1, signUpCount: 30 },
      { raidHelperEventId: "evt-2", startTime: t2, signUpCount: 12 },
    ]);

    const result = await getSignupOccurrenceMetrics();

    expect(result.occurrences).toHaveLength(2);
    expect(result.raidIdToOccurrenceKey.get(1)).not.toBe(result.raidIdToOccurrenceKey.get(3));
  });

  it("falls back to 0 signups when an occurrence has no captured snapshot yet", async () => {
    const startTime = new Date("2026-01-20T20:00:00Z");
    mockWhere.mockReturnValue(
      Promise.resolve([{ raidId: 1, raidHelperEventId: "evt-1", startTime }]),
    );
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([]);

    const result = await getSignupOccurrenceMetrics();

    expect(result.occurrences[0]?.signUpCount).toBe(0);
  });
});

describe("getSignupVsRaidLogSummary", () => {
  it("pairs the raid's earliest log with its linked signup", async () => {
    const logStart = new Date("2026-01-20T22:57:58Z");
    const logEnd = new Date("2026-01-21T02:20:05Z");
    const signupStart = new Date("2026-01-20T23:00:00Z");

    mockWhere
      // db.select(...).from(raidLogs).where(...) — no .limit() on this call.
      .mockReturnValueOnce(
        Promise.resolve([
          { raidLogId: "log-1", name: "Naxxramas", startTimeUTC: logStart, endTimeUTC: logEnd },
        ]),
      )
      // db.select(...).from(raidSignupSnapshotLinks).where(...).limit(1) inside
      // getSignupSnapshotForRaid.
      .mockReturnValueOnce(
        chainable([
          {
            linkId: "link-1",
            source: "manual",
            confidence: 1,
            matchReason: {
              timingDeltaMinutes: 0,
              timingScore: 1,
              zoneScore: 1,
              zoneMatchQuality: "exact_softres",
            },
            raidHelperEventId: "evt-1",
            startTime: signupStart,
          },
        ]),
      );
    mockGetLatestSignupSnapshotForOccurrence.mockResolvedValue({
      title: "Naxx Cleanup",
      channelId: "chan-1",
    });

    const result = await getSignupVsRaidLogSummary(885);

    expect(result.raidLog).toEqual({
      raidLogId: "log-1",
      name: "Naxxramas",
      startTimeUTC: logStart,
      endTimeUTC: logEnd,
      wclUrl: "https://vanilla.warcraftlogs.com/reports/log-1",
    });
    expect(result.signup).toEqual({
      title: "Naxx Cleanup",
      startTime: signupStart,
      source: "manual",
      eventUrl: "https://discord.com/channels/srv-123/chan-1/evt-1",
    });
  });

  it("picks the earliest of multiple raid logs", async () => {
    const earlier = new Date("2026-01-20T22:00:00Z");
    const later = new Date("2026-01-20T23:00:00Z");

    mockWhere
      .mockReturnValueOnce(
        Promise.resolve([
          { raidLogId: "log-later", name: "Naxxramas", startTimeUTC: later, endTimeUTC: null },
          { raidLogId: "log-earlier", name: "Naxxramas", startTimeUTC: earlier, endTimeUTC: null },
        ]),
      )
      .mockReturnValueOnce(chainable([]));

    const result = await getSignupVsRaidLogSummary(885);

    expect(result.raidLog?.raidLogId).toBe("log-earlier");
  });

  it("returns a null raidLog when no log has an imported start time yet", async () => {
    mockWhere.mockReturnValueOnce(Promise.resolve([])).mockReturnValueOnce(chainable([]));

    const result = await getSignupVsRaidLogSummary(885);

    expect(result.raidLog).toBeNull();
    expect(result.signup).toBeUndefined();
    expect(mockGetLatestSignupSnapshotForOccurrence).not.toHaveBeenCalled();
  });
});
