import { describe, expect, it, vi } from "vitest";

// scoreSignupLinkCandidate is pure and never touches the DB, but the module it lives in
// also exports DB-backed functions, so importing it at all pulls in ~/server/db -> ~/env.js
// -> real env validation. CI's Test step runs without SKIP_ENV_VALIDATION (only the Build
// step sets it — see .github/workflows/ci.yml), so that validation fails there with no env
// vars set. Mock the module away rather than touching CI config for a test that doesn't
// need a real database.
vi.mock("~/server/db", () => ({ db: {} }));

import { scoreSignupLinkCandidate } from "~/server/services/raid-signup-link-matching";
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

  it("treats a missing snapshot zone as neutral, not a penalty", () => {
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
    expect(unknownZone.confidence).toBeGreaterThan(mismatchedZone.confidence);
    expect(mismatchedZone.matchReason.zoneMatchQuality).toBe("mismatch");
    expect(mismatchedZone.matchReason.zoneScore).toBe(0);
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
