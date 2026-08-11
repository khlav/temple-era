import { afterEach, describe, expect, it, vi } from "vitest";

// scoreSignupLinkCandidate is pure and never touches the DB, but the module it lives in
// also exports DB-backed functions, so importing it at all pulls in ~/server/db -> ~/env.js
// -> real env validation. CI's Test step runs without SKIP_ENV_VALIDATION (only the Build
// step sets it — see .github/workflows/ci.yml), so that validation fails there with no env
// vars set. Mock the module away rather than touching CI config for a test that doesn't
// need a real database.
let selectResults: unknown[][] = [];

// vi.mock factories are hoisted above the module's static imports, which in turn are
// hoisted above plain top-level `const`s — so a factory referencing an ordinary
// `const mockSelect = vi.fn(...)` below it hits a TDZ ReferenceError once this file also
// statically imports the module under test (as the pre-existing scoreSignupLinkCandidate
// tests do). vi.hoisted() lifts these alongside the vi.mock calls themselves, ahead of
// that import, so they're actually initialized in time.
const { mockSelect, mockInsert, mockValues } = vi.hoisted(() => {
  const mockWhere = vi.fn(() => Promise.resolve(selectResults.shift() ?? []));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockOnConflictDoUpdate = vi.fn(() => Promise.resolve());
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return { mockSelect, mockInsert, mockValues };
});

vi.mock("~/server/db", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

const { mockGetLatestSignupSnapshotsByOccurrence } = vi.hoisted(() => ({
  mockGetLatestSignupSnapshotsByOccurrence: vi.fn(),
}));
vi.mock("~/server/services/raid-helper-snapshot-queries", () => ({
  getLatestSignupSnapshotsByOccurrence: mockGetLatestSignupSnapshotsByOccurrence,
}));

import {
  scoreSignupLinkCandidate,
  generateSignupLinkCandidatesForRaid,
} from "~/server/services/raid-signup-link-matching";
import type { LatestSignupSnapshot } from "~/server/services/raid-helper-snapshot-queries";

function snapshot(overrides: Partial<LatestSignupSnapshot> = {}): LatestSignupSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    raidHelperEventId: "evt-1",
    resolvedEventId: "evt-1",
    checkpoint: "0h",
    targetTime: new Date("2026-01-20T20:00:00Z"),
    capturedAt: new Date("2026-01-20T20:00:00Z"),
    startTime: new Date("2026-01-20T20:00:00Z"),
    signUpCount: 20,
    signups: [],
    title: null,
    channelName: null,
    channelId: null,
    softresId: null,
    scheduledId: null,
    zone: null,
    zoneSource: null,
    ...overrides,
  };
}

const RAID_START = new Date("2026-01-20T20:00:00Z");

describe("scoreSignupLinkCandidate", () => {
  it("scores an exact-time, softres-zone-matched candidate at max confidence", () => {
    const result = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: RAID_START, zone: "Naxxramas", zoneSource: "softres" }),
    );
    expect(result.confidence).toBe(1);
    expect(result.matchReason.zoneMatchQuality).toBe("exact_softres");
    expect(result.matchReason.timingDeltaMinutes).toBe(0);
  });

  it("trusts a title-parsed zone match less than a softres one", () => {
    const softres = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: RAID_START, zone: "Naxxramas", zoneSource: "softres" }),
    );
    const titleParsed = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: RAID_START, zone: "Naxxramas", zoneSource: "title_parse" }),
    );
    expect(titleParsed.confidence).toBeLessThan(softres.confidence);
    expect(titleParsed.matchReason.zoneMatchQuality).toBe("exact_title_parse");
  });

  it("treats a missing zone and a mismatched zone identically — neither is a penalty", () => {
    // Zone naming isn't reliable enough to punish a mismatch (TEMPLE-86): a
    // doubleheader's shared Raid Helper event only ever captures one of its two
    // zones, so "the names don't match" is just as likely to mean "wrong zone
    // recorded for this raid" as "wrong raid". Only an exact match is trusted signal.
    const unknownZone = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: RAID_START, zone: null, zoneSource: null }),
    );
    const mismatchedZone = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: RAID_START, zone: "Molten Core", zoneSource: "softres" }),
    );
    expect(unknownZone.matchReason.zoneMatchQuality).toBe("unavailable");
    expect(mismatchedZone.matchReason.zoneMatchQuality).toBe("mismatch");
    expect(unknownZone.confidence).toBe(mismatchedZone.confidence);
    expect(mismatchedZone.matchReason.zoneScore).toBe(0.5);
  });

  it("lets exact timing carry a doubleheader-style zone-name mismatch to a link-worthy score", () => {
    // e.g. a shared MC+BWL Raid Helper event whose captured zone says "Molten Core" —
    // the BWL raid record should still score well against it on timing alone.
    const result = scoreSignupLinkCandidate(
      "Blackwing Lair",
      RAID_START,
      snapshot({ startTime: RAID_START, zone: "Molten Core", zoneSource: "softres" }),
    );
    expect(result.matchReason.zoneMatchQuality).toBe("mismatch");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("degrades timing score as the candidate drifts further from the raid start", () => {
    const near = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: new Date(RAID_START.getTime() + 20 * 60_000) }), // +20min
    );
    const far = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: new Date(RAID_START.getTime() + 5 * 60 * 60_000) }), // +5h
    );
    const outOfWindow = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: new Date(RAID_START.getTime() + 24 * 60 * 60_000) }), // +24h
    );
    expect(near.matchReason.timingScore).toBeGreaterThan(far.matchReason.timingScore);
    expect(far.matchReason.timingScore).toBeGreaterThan(outOfWindow.matchReason.timingScore);
    expect(outOfWindow.matchReason.timingScore).toBe(0);
  });

  it("reports a negative timingDeltaMinutes when the snapshot starts before the raid", () => {
    const result = scoreSignupLinkCandidate(
      "Naxxramas",
      RAID_START,
      snapshot({ startTime: new Date(RAID_START.getTime() - 30 * 60_000) }),
    );
    expect(result.matchReason.timingDeltaMinutes).toBe(-30);
  });
});

describe("generateSignupLinkCandidatesForRaid", () => {
  afterEach(() => {
    vi.clearAllMocks();
    selectResults = [];
  });

  function mockRaidLookup(raidLogsRows: Array<{ startTimeUTC: Date | null }>) {
    selectResults = [[{ raidId: 1, zone: "Naxxramas", date: "2026-01-20" }], raidLogsRows];
  }

  it("returns no_match when the raid doesn't exist", async () => {
    selectResults = [[]];
    const result = await generateSignupLinkCandidatesForRaid(999);
    expect(result).toEqual({ outcome: "no_match" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns no_match when nothing is in the matching window", async () => {
    mockRaidLookup([{ startTimeUTC: RAID_START }]);
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([]);

    const result = await generateSignupLinkCandidatesForRaid(1);

    expect(result).toEqual({ outcome: "no_match" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns no_match when the top candidate is below the confidence floor", async () => {
    mockRaidLookup([{ startTimeUTC: RAID_START }]);
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([
      {
        raidHelperEventId: "evt-far",
        startTime: new Date(RAID_START.getTime() + 8 * 60 * 60_000),
        zone: null,
        zoneSource: null,
      },
    ]);

    const result = await generateSignupLinkCandidatesForRaid(1);

    expect(result.outcome).toBe("no_match");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns ambiguous when the top two candidates are too close to call", async () => {
    mockRaidLookup([{ startTimeUTC: RAID_START }]);
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([
      {
        raidHelperEventId: "evt-a",
        startTime: RAID_START,
        zone: "Naxxramas",
        zoneSource: "softres",
      },
      {
        raidHelperEventId: "evt-b",
        startTime: RAID_START,
        zone: "Naxxramas",
        zoneSource: "softres",
      },
    ]);

    const result = await generateSignupLinkCandidatesForRaid(1);

    expect(result).toEqual({ outcome: "ambiguous" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("links the top candidate and upserts on raidId", async () => {
    mockRaidLookup([{ startTimeUTC: RAID_START }]);
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([
      {
        raidHelperEventId: "evt-a",
        startTime: RAID_START,
        zone: "Naxxramas",
        zoneSource: "softres",
      },
    ]);

    const result = await generateSignupLinkCandidatesForRaid(1);

    expect(result).toEqual({ outcome: "linked", confidence: 1 });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        raidId: 1,
        raidHelperEventId: "evt-a",
        startTime: RAID_START,
        source: "auto",
        confidence: 1,
      }),
    );
  });

  it("still links a doubleheader raid despite a zone-name mismatch, on timing alone", async () => {
    mockRaidLookup([{ startTimeUTC: RAID_START }]);
    mockGetLatestSignupSnapshotsByOccurrence.mockResolvedValue([
      {
        raidHelperEventId: "evt-mc-bwl",
        startTime: RAID_START,
        zone: "Molten Core",
        zoneSource: "softres",
      },
    ]);

    const result = await generateSignupLinkCandidatesForRaid(1);

    expect(result.outcome).toBe("linked");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
