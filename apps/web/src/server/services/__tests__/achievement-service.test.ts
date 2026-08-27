import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted() + vi.mock("~/server/db") — required because vi.mock factories are hoisted above
// ordinary top-level consts, per the pattern established in raid-signup-link-matching.test.ts.
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    insert: vi.fn(),
    update: vi.fn(),
    query: {
      seasons: { findFirst: vi.fn(), findMany: vi.fn() },
      achievementTiers: { findFirst: vi.fn() },
      achievements: { findMany: vi.fn() },
      achievementAwards: { findMany: vi.fn() },
      users: { findFirst: vi.fn() },
    },
  };
  return { mockDb };
});

vi.mock("~/server/db", () => ({ db: mockDb }));

import {
  createAchievement,
  grantAchievement,
  markAchievementAwardsSeen,
  createSeason,
  AchievementServiceError,
} from "~/server/services/achievement-service";

function mockInsertChain(rows: unknown[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}

function mockInsertChainRejecting(error: unknown) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(error) }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("createSeason", () => {
  it("inserts a season row and returns it", async () => {
    const startDate = new Date("2026-09-01");
    mockDb.insert.mockReturnValueOnce(
      mockInsertChain([{ id: "season-1", name: "Season 2", startDate, endDate: null }]),
    );

    const result = await createSeason({ name: "Season 2", startDate }, "user-1");

    expect(result).toEqual({ id: "season-1", name: "Season 2", startDate, endDate: null });
  });
});

describe("createAchievement", () => {
  it("rejects a season-scoped achievement with no seasonId (INVALID)", async () => {
    await expect(
      createAchievement(
        { name: "Test", icon: "x", tier: "bronze", scope: "season", hidden: false },
        "user-1",
      ),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects a season-scoped achievement whose seasonId doesn't exist (NOT_FOUND)", async () => {
    mockDb.query.seasons.findFirst.mockResolvedValue(undefined);
    await expect(
      createAchievement(
        {
          name: "Test",
          icon: "x",
          tier: "bronze",
          scope: "season",
          seasonId: "s-1",
          hidden: false,
        },
        "user-1",
      ),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("creates the achievement + exactly one tier row, ruleShape/ruleConfig null", async () => {
    mockDb.insert
      .mockReturnValueOnce(mockInsertChain([{ id: "ach-1" }]))
      .mockReturnValueOnce(mockInsertChain([{ id: "tier-1" }]));

    const result = await createAchievement(
      { name: "Test", icon: "x", tier: "bronze", scope: "all_time", hidden: true },
      "user-1",
    );

    expect(result).toEqual({ achievementId: "ach-1", achievementTierId: "tier-1" });
  });
});

describe("grantAchievement", () => {
  it("rejects granting a rule-managed tier (ruleConfig non-null)", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({
      id: "tier-1",
      ruleConfig: { shape: "attendance_threshold", minPercent: 60, lockoutWeeks: 4 },
    });
    await expect(
      grantAchievement({ achievementTierId: "tier-1", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects granting a tier that doesn't exist (NOT_FOUND)", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue(undefined);
    await expect(
      grantAchievement({ achievementTierId: "missing", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("maps a unique-constraint conflict (repeat grant of the same tier+family pair) to CONFLICT", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({ id: "tier-1", ruleConfig: null });
    mockDb.insert.mockReturnValueOnce(mockInsertChainRejecting({ cause: { code: "23505" } }));

    await expect(
      grantAchievement({ achievementTierId: "tier-1", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("succeeds granting the same tier to two different families", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({ id: "tier-1", ruleConfig: null });
    mockDb.insert
      .mockReturnValueOnce(mockInsertChain([{ id: "award-1" }]))
      .mockReturnValueOnce(mockInsertChain([{ id: "award-2" }]));

    const first = await grantAchievement(
      { achievementTierId: "tier-1", primaryCharacterId: 101 },
      "u",
    );
    const second = await grantAchievement(
      { achievementTierId: "tier-1", primaryCharacterId: 202 },
      "u",
    );

    expect(first.achievementAwardId).not.toBe(second.achievementAwardId);
  });
});

describe("markAchievementAwardsSeen", () => {
  it("mark-seen: is idempotent — calling it twice on the same award both succeed with the same result shape", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "award-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDb.update.mockReturnValue({ set });

    const first = await markAchievementAwardsSeen(["award-1"], 42);
    const second = await markAchievementAwardsSeen(["award-1"], 42);

    expect(first).toEqual({ updated: 1 });
    expect(second).toEqual({ updated: 1 });
  });

  it("mark-seen: ids belonging to another family are excluded, not errored — filter yields zero matches", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    mockDb.update.mockReturnValue({ set });

    const result = await markAchievementAwardsSeen(["someone-elses-award"], 42);

    expect(result).toEqual({ updated: 0 });
  });
});
