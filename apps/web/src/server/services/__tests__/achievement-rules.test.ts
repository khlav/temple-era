import { afterEach, describe, expect, it, vi } from "vitest";
import type * as MatchSignupsModule from "~/server/api/helpers/match-signups";

// vi.hoisted() + vi.mock("~/server/db") — required because vi.mock factories are hoisted above
// ordinary top-level consts, per the pattern established in raid-signup-link-matching.test.ts /
// achievement-service.test.ts.
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    query: {
      achievementTiers: { findMany: vi.fn() },
      achievementAwards: { findMany: vi.fn() },
      raidSignupSnapshotLinks: { findMany: vi.fn() },
    },
  };
  return { mockDb };
});
vi.mock("~/server/db", () => ({ db: mockDb }));

const { mockGetSignupSnapshotHistoryForOccurrence } = vi.hoisted(() => ({
  mockGetSignupSnapshotHistoryForOccurrence: vi.fn(),
}));
vi.mock("~/server/services/raid-helper-snapshot-queries", () => ({
  getSignupSnapshotHistoryForOccurrence: mockGetSignupSnapshotHistoryForOccurrence,
}));

const { mockMatchSignupsToCharacters } = vi.hoisted(() => ({
  mockMatchSignupsToCharacters: vi.fn(),
}));
vi.mock("~/server/api/helpers/match-signups", async () => {
  const actual = await vi.importActual<typeof MatchSignupsModule>(
    "~/server/api/helpers/match-signups",
  );
  return { ...actual, matchSignupsToCharacters: mockMatchSignupsToCharacters };
});

import {
  resolveEvaluationWindow,
  scoreByShape,
  buildRuleEvaluationContext,
  evaluateAchievementsForFamily,
  getHighestTierPerAchievement,
  getNextTierProgress,
  type RuleEvaluationContext,
} from "~/server/services/achievement-rules";
import type { AchievementRuleConfig } from "~/server/db/schema";

// db/primaryCharacterId are unused by every current shape (scoreByShape's signature just leaves
// room for a future one that needs real I/O) — a dummy value keeps every scoreByShape call site
// terse.
const NOOP_DB = {} as never;

function chainable<T>(result: T) {
  const obj = {
    from: () => obj,
    innerJoin: () => obj,
    where: () => obj,
    then: (resolve: (v: T) => void) => resolve(result),
  };
  return obj;
}

function insertChain(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Window resolution ──────────────────────────────────────────────────────────

describe("resolveEvaluationWindow", () => {
  it("season-scoping: clips to season start even when lockoutWeeks would reach further back", () => {
    const seasonStart = new Date("2026-09-01T00:00:00Z");
    const asOf = new Date("2026-09-15T00:00:00Z"); // ~2 weeks into the season
    const window = resolveEvaluationWindow("season", seasonStart, 10, asOf); // 10wk lookback would reach before season start
    expect(window.start!.getTime()).toBe(seasonStart.getTime());
  });

  it("season-scoping: uses the lockback floor when it's inside the season", () => {
    const seasonStart = new Date("2026-01-01T00:00:00Z");
    const asOf = new Date("2026-09-15T00:00:00Z");
    const window = resolveEvaluationWindow("season", seasonStart, 4, asOf);
    expect(window.start!.getTime()).toBeGreaterThan(seasonStart.getTime());
  });

  it("all-time: start is null (fully unbounded) when no lockoutWeeks given", () => {
    const window = resolveEvaluationWindow(
      "all_time",
      null,
      undefined,
      new Date("2026-09-15T00:00:00Z"),
    );
    expect(window.start).toBeNull();
  });

  it("season-scoping: a season-scoped tier with no seasonStartDate throws rather than silently unbounding", () => {
    expect(() => resolveEvaluationWindow("season", null, 4, new Date())).toThrow();
  });
});

// ─── Per-shape scorers (via scoreByShape) ───────────────────────────────────────

const WINDOW = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-15T00:00:00Z") };

function ctx(overrides: Partial<RuleEvaluationContext> = {}): RuleEvaluationContext {
  return {
    familyCharacterIds: [1, 2],
    attendedRaids: [],
    benchedRaids: [],
    matchedSignups: [],
    raidsInWindow: [],
    ...overrides,
  };
}

describe("shape: weighted-attendance", () => {
  it("weighted-attendance: sums per-raid attendanceWeight per lockout week, dedupes a same-zone re-log within one week, and caps each week's total at 3", async () => {
    const config: AchievementRuleConfig = {
      shape: "weighted_attendance_threshold",
      minPercent: 50,
      lockoutWeeks: 2,
    };
    const week1 = new Date("2026-09-01T00:00:00Z");
    const week2 = new Date("2026-09-08T00:00:00Z");
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Naxxramas",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
        {
          // same zone, same week as raid 1 — must not double-count toward that week's total
          raidId: 2,
          characterId: 1,
          zone: "Naxxramas",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-02"),
          attendanceWeight: 1,
        },
        {
          raidId: 3,
          characterId: 1,
          zone: "Blackwing Lair",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-03"),
          attendanceWeight: 1,
        },
        {
          raidId: 4,
          characterId: 1,
          zone: "Temple of Ahn'Qiraj",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-04"),
          attendanceWeight: 1,
        },
        {
          // week1 pre-cap total: 1 (Naxx) + 1 (BWL) + 1 (AQ) + 0.5 (MC) = 3.5, capped to 3
          raidId: 5,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-05"),
          attendanceWeight: 0.5,
        },
        {
          raidId: 6,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: week2,
          startTime: new Date("2026-09-08"),
          attendanceWeight: 0.5,
        },
      ],
    });
    // earned = 3 (week1, capped) + 0.5 (week2) = 3.5; target = lockoutWeeks(2) * 3 = 6
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress).toEqual({ current: 58, target: 50 });
    expect(result.crossed).toBe(true);
  });

  it("weighted-attendance: the percent denominator is a fixed lockoutWeeks*3 point cap, not actual-elapsed-weeks-with-data — a season that hasn't run the full window yet doesn't get an inflated percentage", async () => {
    const config: AchievementRuleConfig = {
      shape: "weighted_attendance_threshold",
      minPercent: 50,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Naxxramas",
          class: "Warrior",
          lockoutWeekStart: new Date("2026-09-01"),
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
      ],
    });
    // earned = 1; target = lockoutWeeks(6) * 3 = 18 — NOT 1 week's worth
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress).toEqual({ current: 6, target: 50 });
    expect(result.crossed).toBe(false);
  });
});

describe("shape: consistency", () => {
  it("consistency: requires BOTH an early confirmed signup AND matching attendance by the same character", async () => {
    const config: AchievementRuleConfig = {
      shape: "consistency_match",
      minCount: 1,
      lockoutWeeks: 6,
    };

    const signupOnly = ctx({
      matchedSignups: [
        {
          raidId: 1,
          signedUpCharacterId: 1,
          bucket: "confirmed",
          checkpointHoursBeforeStart: 120,
          raidStartTime: new Date("2026-09-10"),
        },
      ],
    });
    expect((await scoreByShape(NOOP_DB, 1, signupOnly, config, WINDOW)).crossed).toBe(false);

    const both = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-10"),
          attendanceWeight: 1,
        },
      ],
      matchedSignups: [
        {
          raidId: 1,
          signedUpCharacterId: 1,
          bucket: "confirmed",
          checkpointHoursBeforeStart: 120,
          raidStartTime: new Date("2026-09-10"),
        },
      ],
    });
    expect((await scoreByShape(NOOP_DB, 1, both, config, WINDOW)).crossed).toBe(true);
  });

  it("consistency: an ambiguous/unmatched signup (excluded from matchedSignups by the context builder) does not count", async () => {
    const config: AchievementRuleConfig = {
      shape: "consistency_match",
      minCount: 1,
      lockoutWeeks: 6,
    };
    // matchedSignups is already filtered to identified-family rows only by buildRuleEvaluationContext —
    // an empty array here represents "nothing survived that filter".
    const noMatch = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-10"),
          attendanceWeight: 1,
        },
      ],
      matchedSignups: [],
    });
    expect((await scoreByShape(NOOP_DB, 1, noMatch, config, WINDOW)).crossed).toBe(false);
  });
});

describe("shape: flexibility", () => {
  it("flexibility: awards when signed-up and attending characters differ but share a family", async () => {
    const config: AchievementRuleConfig = {
      shape: "flexibility_match",
      minCount: 1,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 2,
          zone: "Molten Core",
          class: "Mage",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-10"),
          attendanceWeight: 1,
        },
      ],
      matchedSignups: [
        {
          raidId: 1,
          signedUpCharacterId: 1,
          bucket: "confirmed",
          checkpointHoursBeforeStart: 24,
          raidStartTime: new Date("2026-09-10"),
        },
      ],
    });
    expect((await scoreByShape(NOOP_DB, 1, context, config, WINDOW)).crossed).toBe(true);
  });

  it("flexibility: does not award when the attending character isn't linked (not in matchedSignups' family)", async () => {
    const config: AchievementRuleConfig = {
      shape: "flexibility_match",
      minCount: 1,
      lockoutWeeks: 6,
    };
    const context = ctx({ attendedRaids: [], matchedSignups: [] });
    expect((await scoreByShape(NOOP_DB, 1, context, config, WINDOW)).crossed).toBe(false);
  });
});

describe("shape: bench-credit", () => {
  it("bench-credit: counts officer-entered raid_bench_map rows (benchedRaids), deduped per raid, ignoring attendance/signup data entirely", async () => {
    const config: AchievementRuleConfig = {
      shape: "bench_credit_count",
      minCount: 2,
      lockoutWeeks: 6,
    };
    const benched = (raidId: number, dateStr: string) => ({
      raidId,
      characterId: 1,
      zone: "Naxxramas",
      class: "Warrior",
      lockoutWeekStart: new Date(dateStr),
      startTime: new Date(dateStr),
      attendanceWeight: 1,
    });
    const context = ctx({
      benchedRaids: [benched(1, "2026-09-10"), benched(2, "2026-09-11")],
      // A "confirmed" attendance signal must never contribute — bench credit is unrelated to
      // matchedSignups now, whatever bucket it carries.
      matchedSignups: [
        {
          raidId: 3,
          signedUpCharacterId: 1,
          bucket: "confirmed",
          checkpointHoursBeforeStart: 48,
          raidStartTime: new Date("2026-09-12"),
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress.current).toBe(2); // raids 1 and 2 only
    expect(result.crossed).toBe(true);
  });
});

describe("shape: zone-attendance", () => {
  it("zone-attendance: evaluates each 40-man zone independently", async () => {
    const config: AchievementRuleConfig = {
      shape: "zone_attendance_threshold",
      zone: "Molten Core",
      minCount: 2,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-10"),
          attendanceWeight: 1,
        },
        {
          raidId: 2,
          characterId: 1,
          zone: "Blackwing Lair",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-12"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress.current).toBe(1); // only Molten Core counts
    expect(result.crossed).toBe(false);
  });
});

describe("shape: class-attendance", () => {
  it("class-attendance: same pattern as zone-attendance, keyed by class instead of zone", async () => {
    const config: AchievementRuleConfig = {
      shape: "class_attendance_threshold",
      class: "Warrior",
      minCount: 2,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-10"),
          attendanceWeight: 1,
        },
        {
          raidId: 2,
          characterId: 1,
          zone: "Blackwing Lair",
          class: "Mage",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-12"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress.current).toBe(1); // only the Warrior raid counts
    expect(result.crossed).toBe(false);
  });
});

describe("shape: raid-marathon", () => {
  it("raid-marathon: counts distinct raids in a single lockout week, not raw attendance across weeks", async () => {
    const config: AchievementRuleConfig = {
      shape: "raid_marathon_density",
      minRaidsInOneWeek: 3,
      lockoutWeeks: 4,
    };
    const week1 = new Date("2026-09-01T00:00:00Z");
    const week2 = new Date("2026-09-08T00:00:00Z");
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "MC",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
        {
          raidId: 2,
          characterId: 1,
          zone: "MC",
          class: "Warrior",
          lockoutWeekStart: week1,
          startTime: new Date("2026-09-02"),
          attendanceWeight: 1,
        },
        {
          raidId: 3,
          characterId: 1,
          zone: "MC",
          class: "Warrior",
          lockoutWeekStart: week2,
          startTime: new Date("2026-09-08"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress.current).toBe(2); // max in any ONE week is 2, not 3 total
    expect(result.crossed).toBe(false);
  });
});

describe("shape: zone-breadth", () => {
  it("zone-breadth: counts distinct zones; attending the same zone twice does not double-count", async () => {
    const config: AchievementRuleConfig = {
      shape: "zone_breadth_window",
      minDistinctZones: 2,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
        {
          raidId: 2,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-08"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.progress.current).toBe(1);
    expect(result.crossed).toBe(false);
  });
});

describe("shape: class-breadth", () => {
  it("class-breadth: counts distinct classes the family raided as within the window", async () => {
    const config: AchievementRuleConfig = {
      shape: "class_breadth_window",
      minDistinctClasses: 2,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "MC",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
        {
          raidId: 2,
          characterId: 2,
          zone: "MC",
          class: "Mage",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-08"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.crossed).toBe(true);
  });
});

describe("shape: family-double-up", () => {
  it("family-double-up: awards when two family characters both appear in one raid's attendee set", async () => {
    const config: AchievementRuleConfig = {
      shape: "family_double_up_cooccurrence",
      minCount: 1,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "MC",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
        {
          raidId: 1,
          characterId: 2,
          zone: "MC",
          class: "Mage",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result.crossed).toBe(true);
  });
});

describe("shape: all-time", () => {
  it("all-time: counts qualifying data from a season two seasons prior — not clipped to the current season", async () => {
    const config: AchievementRuleConfig = { shape: "class_breadth_window", minDistinctClasses: 2 }; // no lockoutWeeks = unbounded
    const window = resolveEvaluationWindow(
      "all_time",
      null,
      config.lockoutWeeks,
      new Date("2026-09-15"),
    );
    expect(window.start).toBeNull();
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "MC",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2024-01-01"),
          attendanceWeight: 1,
        }, // two seasons ago
        {
          raidId: 2,
          characterId: 2,
          zone: "MC",
          class: "Mage",
          lockoutWeekStart: new Date(),
          startTime: new Date("2024-01-08"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, window);
    expect(result.crossed).toBe(true);
  });
});

describe("progress", () => {
  it("progress: exposes a raw current/target value alongside crossed, not just pass/fail", async () => {
    const config: AchievementRuleConfig = {
      shape: "zone_breadth_window",
      minDistinctZones: 5,
      lockoutWeeks: 6,
    };
    const context = ctx({
      attendedRaids: [
        {
          raidId: 1,
          characterId: 1,
          zone: "Molten Core",
          class: "Warrior",
          lockoutWeekStart: new Date(),
          startTime: new Date("2026-09-01"),
          attendanceWeight: 1,
        },
      ],
    });
    const result = await scoreByShape(NOOP_DB, 1, context, config, WINDOW);
    expect(result).toEqual({ crossed: false, progress: { current: 1, target: 5 } });
  });
});

// ─── Context builder ─────────────────────────────────────────────────────────────

describe("buildRuleEvaluationContext", () => {
  it("context: excludes ambiguous/unmatched signups (matchedPrimaryCharacterId null) from matchedSignups", async () => {
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(chainable([])) // attendanceRows
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([]);

    const context = await buildRuleEvaluationContext(mockDb as never, 1, null, new Date());
    expect(context.matchedSignups).toEqual([]);
  });

  it("context: a raid with no signup link contributes no matchedSignups rows for that raid", async () => {
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(
        chainable([{ raidId: 1, zone: "Molten Core", date: "2026-09-10", characterId: 1 }]),
      )
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([{ raidId: 1, date: "2026-09-10" }]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([]); // no link for raid 1

    const context = await buildRuleEvaluationContext(mockDb as never, 1, null, new Date());
    expect(context.attendedRaids).toHaveLength(1);
    expect(context.matchedSignups).toEqual([]);
  });

  it("context: resolves a real signup link end-to-end — includes matched(confirmed) and skipped-with-family(bench), excludes ambiguous and other-family rows", async () => {
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(chainable([])) // attendanceRows
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([
      { raidId: 1, raidHelperEventId: "evt-1", startTime: new Date("2026-09-10") },
    ]);
    mockGetSignupSnapshotHistoryForOccurrence.mockResolvedValue([
      {
        checkpoint: "96h",
        signups: [
          { userId: "u1", name: "Alice", className: "Warrior", specName: "Fury" },
          { userId: "u2", name: "Bob", className: "bench", specName: "" },
          { userId: "u3", name: "Carol", className: "Mage", specName: "Frost" },
          { userId: "u4", name: "Dave", className: "Priest", specName: "Holy" },
        ],
      },
    ]);
    mockMatchSignupsToCharacters.mockResolvedValue([
      {
        userId: "u1",
        discordName: "Alice",
        className: "Warrior",
        specName: "Fury",
        partyId: null,
        slotId: null,
        status: "matched",
        matchedPrimaryCharacterId: 1,
        matchedPrimaryCharacterName: "Alice",
        matchedCharacter: {
          characterId: 1,
          characterName: "Alice",
          characterServer: "Ashkandi",
          characterClass: "Warrior",
          primaryCharacterId: null,
          primaryCharacterName: null,
        },
      },
      {
        userId: "u2",
        discordName: "Bob",
        className: "bench",
        specName: "",
        partyId: null,
        slotId: null,
        status: "skipped",
        matchedPrimaryCharacterId: 1, // family identified via name match despite non-class className
        matchedPrimaryCharacterName: "Alice",
        matchedCharacter: {
          characterId: 1,
          characterName: "Alice",
          characterServer: "Ashkandi",
          characterClass: "Warrior",
          primaryCharacterId: null,
          primaryCharacterName: null,
        },
      },
      {
        userId: "u3",
        discordName: "Carol",
        className: "Mage",
        specName: "Frost",
        partyId: null,
        slotId: null,
        status: "ambiguous",
        matchedPrimaryCharacterId: null,
      },
      {
        userId: "u4",
        discordName: "Dave",
        className: "Priest",
        specName: "Holy",
        partyId: null,
        slotId: null,
        status: "matched",
        matchedPrimaryCharacterId: 999, // a different family entirely
        matchedPrimaryCharacterName: "Dave",
        matchedCharacter: {
          characterId: 999,
          characterName: "Dave",
          characterServer: "Ashkandi",
          characterClass: "Priest",
          primaryCharacterId: null,
          primaryCharacterName: null,
        },
      },
    ]);

    const context = await buildRuleEvaluationContext(
      mockDb as never,
      1,
      null,
      new Date("2026-09-15"),
    );

    expect(context.matchedSignups).toEqual([
      {
        raidId: 1,
        signedUpCharacterId: 1,
        bucket: "confirmed",
        checkpointHoursBeforeStart: 96,
        raidStartTime: new Date("2026-09-10"),
      },
      {
        raidId: 1,
        signedUpCharacterId: 1,
        bucket: "bench",
        checkpointHoursBeforeStart: 96,
        raidStartTime: new Date("2026-09-10"),
      },
    ]);
  });
});

// ─── Orchestrator: idempotency, append-per-crossing, extensibility ────────────────

describe("evaluateAchievementsForFamily", () => {
  const ZONE_TIER = {
    id: "tier-bronze",
    ruleConfig: {
      shape: "zone_attendance_threshold",
      zone: "Molten Core",
      minCount: 1,
      lockoutWeeks: 4,
    },
    tier: "bronze",
    achievement: { scope: "all_time", season: null },
  };

  it("idempotent: running evaluation twice against unchanged data produces zero duplicate rows the second time", async () => {
    mockDb.query.achievementTiers.findMany.mockResolvedValue([ZONE_TIER]);
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(
        chainable([{ raidId: 1, zone: "Molten Core", date: "2026-09-10", characterId: 1 }]),
      )
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([{ raidId: 1, date: "2026-09-10" }]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([]);
    mockDb.query.achievementAwards.findMany.mockResolvedValueOnce([]); // pre-fetch: none held yet
    mockDb.insert.mockReturnValueOnce(insertChain([{ id: "award-1" }])); // first run: inserted

    const first = await evaluateAchievementsForFamily(mockDb as never, 1, new Date("2026-09-15"));
    expect(first.newAwards).toHaveLength(1);

    mockDb.query.achievementTiers.findMany.mockResolvedValue([ZONE_TIER]);
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(
        chainable([{ raidId: 1, zone: "Molten Core", date: "2026-09-10", characterId: 1 }]),
      )
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([{ raidId: 1, date: "2026-09-10" }]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([]);
    // The pre-fetch now reports tier-bronze as already held (as it would be for real, after the
    // first run's insert committed) — the in-memory skip should short-circuit before ever
    // reaching the DB a second time, so no insert mock is queued for this call.
    mockDb.query.achievementAwards.findMany.mockResolvedValueOnce([
      { achievementTierId: "tier-bronze", primaryCharacterId: 1 },
    ]);

    const second = await evaluateAchievementsForFamily(mockDb as never, 1, new Date("2026-09-15"));
    expect(second.newAwards).toHaveLength(0);
    // Still 1 — the one real insert from the first run above. The in-memory skip means the
    // second run never calls db.insert at all (no second call queued for it via mockReturnValueOnce).
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("append-per-crossing: bronze then silver on the same achievement produce two rows; highest tier is queryable", async () => {
    mockDb.query.achievementAwards.findMany.mockResolvedValue([
      { achievementTier: { achievementId: "ach-1", tier: "bronze" } },
      { achievementTier: { achievementId: "ach-1", tier: "silver" } },
    ]);
    const highest = await getHighestTierPerAchievement(mockDb as never, 1);
    expect(highest.get("ach-1")).toBe("silver");
  });

  it("extensibility: a second all-time class_breadth_window achievement evaluates via the same dispatch, no achievement-rules.ts change needed", async () => {
    const secondAllTimeTier = {
      id: "tier-2",
      ruleConfig: { shape: "class_breadth_window", minDistinctClasses: 1 },
      tier: "platinum",
      achievement: { scope: "all_time", season: null },
    };
    mockDb.query.achievementTiers.findMany.mockResolvedValue([secondAllTimeTier]);
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(
        chainable([{ raidId: 1, zone: "Molten Core", date: "2026-09-10", characterId: 1 }]),
      )
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([{ raidId: 1, date: "2026-09-10" }]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([]);
    mockDb.query.achievementAwards.findMany.mockResolvedValueOnce([]);
    mockDb.insert.mockReturnValueOnce(insertChain([{ id: "award-2" }]));

    const result = await evaluateAchievementsForFamily(mockDb as never, 1, new Date("2026-09-15"));
    expect(result.newAwards).toHaveLength(1);
  });
});

describe("getNextTierProgress", () => {
  it("progress: a family below threshold gets the raw current/target value, not just crossed=false", async () => {
    mockDb.query.achievementTiers.findMany.mockResolvedValue([
      {
        id: "tier-1",
        achievementId: "ach-1",
        tier: "bronze",
        ruleConfig: { shape: "zone_breadth_window", minDistinctZones: 3, lockoutWeeks: 6 },
        achievement: { scope: "all_time", season: null },
      },
    ]);
    mockDb.query.achievementAwards.findMany.mockResolvedValue([]); // nothing crossed yet
    mockDb.select
      .mockReturnValueOnce(
        chainable([{ characterId: 1, class: "Warrior", primaryCharacterId: null }]),
      )
      .mockReturnValueOnce(
        chainable([{ raidId: 1, zone: "Molten Core", date: "2026-09-10", characterId: 1 }]),
      )
      .mockReturnValueOnce(chainable([])) // benchRows
      .mockReturnValueOnce(chainable([{ raidId: 1, date: "2026-09-10" }]));
    mockDb.query.raidSignupSnapshotLinks.findMany.mockResolvedValue([]);

    const result = await getNextTierProgress(mockDb as never, 1, "ach-1", new Date("2026-09-15"));
    expect(result).toEqual({ nextTier: "bronze", progress: { current: 1, target: 3 } });
  });

  it("progress: returns null when every tier is already awarded (maxed out)", async () => {
    mockDb.query.achievementTiers.findMany.mockResolvedValue([
      {
        id: "tier-1",
        achievementId: "ach-1",
        tier: "bronze",
        ruleConfig: { shape: "zone_breadth_window", minDistinctZones: 3, lockoutWeeks: 6 },
        achievement: { scope: "all_time", season: null },
      },
    ]);
    mockDb.query.achievementAwards.findMany.mockResolvedValue([{ achievementTierId: "tier-1" }]);

    const result = await getNextTierProgress(mockDb as never, 1, "ach-1", new Date("2026-09-15"));
    expect(result).toBeNull();
  });
});
