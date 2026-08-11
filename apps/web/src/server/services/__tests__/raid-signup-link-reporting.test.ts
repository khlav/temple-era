import { afterEach, describe, expect, it, vi } from "vitest";

// Same reasoning as raid-signup-link-matching.test.ts: importing this module pulls in
// ~/server/db -> ~/env.js's real env validation, which CI's Test step runs without
// SKIP_ENV_VALIDATION. Mock the DB and the snapshot-query module this file reads
// through, rather than touching CI config for tests that don't need a real database.
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

const mockGetLatestSignupSnapshotForOccurrence = vi.fn();
const mockGetLatestSignupSnapshotsByOccurrence = vi.fn();
vi.mock("~/server/services/raid-helper-snapshot-queries", () => ({
  getLatestSignupSnapshotForOccurrence: mockGetLatestSignupSnapshotForOccurrence,
  getLatestSignupSnapshotsByOccurrence: mockGetLatestSignupSnapshotsByOccurrence,
}));

const { getSignupSnapshotForRaid, getSignupOccurrenceMetrics } =
  await import("~/server/services/raid-signup-link-reporting");

afterEach(() => {
  vi.clearAllMocks();
});

describe("getSignupSnapshotForRaid", () => {
  it("returns undefined when the raid has no confirmed link", async () => {
    mockWhere.mockReturnValue(chainable([]));

    const result = await getSignupSnapshotForRaid(1);

    expect(result).toBeUndefined();
    expect(mockGetLatestSignupSnapshotForOccurrence).not.toHaveBeenCalled();
  });

  it("enriches the confirmed link with its latest snapshot", async () => {
    const startTime = new Date("2026-01-20T20:00:00Z");
    mockWhere.mockReturnValue(
      chainable([
        {
          linkId: "link-1",
          status: "confirmed",
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
  it("returns nothing and skips the snapshot lookup when no confirmed links exist", async () => {
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
