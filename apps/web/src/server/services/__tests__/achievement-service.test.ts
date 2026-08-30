import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted() + vi.mock("~/server/db") — required because vi.mock factories are hoisted above
// ordinary top-level consts, per the pattern established in raid-signup-link-matching.test.ts.
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    query: {
      seasons: { findFirst: vi.fn(), findMany: vi.fn() },
      achievementTiers: { findFirst: vi.fn(), findMany: vi.fn() },
      achievements: { findMany: vi.fn(), findFirst: vi.fn() },
      achievementAwards: { findMany: vi.fn(), findFirst: vi.fn() },
      characters: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
  };
  // Real db.transaction runs its callback with a tx handle scoped to one connection; the tests
  // only assert on the calls made inside, so replaying the same mockDb (already configured with
  // whatever delete/insert mocks a given test set up) is equivalent here.
  mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb));
  return { mockDb };
});

vi.mock("~/server/db", () => ({ db: mockDb }));

import {
  createAchievement,
  updateAchievement,
  deleteAchievement,
  grantAchievement,
  grantCustomAchievement,
  revokeAward,
  markAchievementAwardsSeen,
  AchievementServiceError,
} from "~/server/services/achievement-service";

function mockInsertChain(rows: unknown[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}

function mockInsertChainRejecting(error: unknown) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(error) }) };
}

function mockDeleteChain(rows: unknown[]) {
  return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}

function mockDeleteChainNoReturning() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

function mockUpdateChainNoReturning() {
  const where = vi.fn().mockResolvedValue(undefined);
  return { set: vi.fn().mockReturnValue({ where }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("revokeAward", () => {
  it("deletes every tier's award row this family holds for the achievement, not just the one passed in", async () => {
    mockDb.query.achievementAwards.findFirst.mockResolvedValueOnce({
      primaryCharacterId: 42,
      achievementTier: { achievementId: "ach-1" },
    });
    mockDb.query.achievementTiers.findMany.mockResolvedValueOnce([
      { id: "tier-copper" },
      { id: "tier-silver" },
      { id: "tier-gold" },
    ]);
    mockDb.delete.mockReturnValueOnce(
      mockDeleteChain([{ id: "award-copper" }, { id: "award-gold" }]),
    );

    const result = await revokeAward("award-gold");

    expect(result).toEqual({ revokedAwardIds: ["award-copper", "award-gold"] });
  });

  it("throws NOT_FOUND when the award doesn't exist", async () => {
    mockDb.query.achievementAwards.findFirst.mockResolvedValueOnce(undefined);

    await expect(revokeAward("missing")).rejects.toThrow(AchievementServiceError);
  });
});

describe("createAchievement", () => {
  it("rejects a season-scoped achievement with no seasonId (INVALID)", async () => {
    await expect(
      createAchievement(
        { name: "Test", icon: "spell_holy_holybolt", tier: "copper", scope: "season" },
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
          icon: "spell_holy_holybolt",
          tier: "copper",
          scope: "season",
          seasonId: "s-1",
        },
        "user-1",
      ),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects an icon name not present in the real icon catalog (INVALID)", async () => {
    await expect(
      createAchievement(
        { name: "Test", icon: "not-a-real-icon-xyz", tier: "copper", scope: "all_time" },
        "user-1",
      ),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("creates the achievement + exactly one tier row, ruleShape/ruleConfig null, always hidden regardless of caller input", async () => {
    const insertAchievement = mockInsertChain([{ id: "ach-1" }]);
    mockDb.insert
      .mockReturnValueOnce(insertAchievement)
      .mockReturnValueOnce(mockInsertChain([{ id: "tier-1" }]));

    const result = await createAchievement(
      { name: "Test", icon: "spell_holy_holybolt", tier: "copper", scope: "all_time" },
      "user-1",
    );

    expect(result).toEqual({ achievementId: "ach-1", achievementTierId: "tier-1" });
    expect(insertAchievement.values).toHaveBeenCalledWith(
      expect.objectContaining({ hidden: true }),
    );
  });
});

describe("updateAchievement", () => {
  it("throws NOT_FOUND when the achievement doesn't exist", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce(undefined);

    await expect(
      updateAchievement("missing", {
        name: "Test",
        icon: "spell_holy_holybolt",
        tier: "silver",
        scope: "all_time",
      }),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects editing a rule-based achievement (INVALID)", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: "class_attendance_threshold",
      tiers: [{ id: "tier-1" }],
    });

    await expect(
      updateAchievement("ach-1", {
        name: "Test",
        icon: "spell_holy_holybolt",
        tier: "silver",
        scope: "all_time",
      }),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects an icon name not present in the real icon catalog (INVALID)", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: null,
      tiers: [{ id: "tier-1" }],
    });

    await expect(
      updateAchievement("ach-1", {
        name: "Test",
        icon: "not-a-real-icon-xyz",
        tier: "silver",
        scope: "all_time",
      }),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("updates the achievement row and its single tier's level", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: null,
      tiers: [{ id: "tier-1" }],
    });
    const updateAchievementsCall = mockUpdateChainNoReturning();
    const updateTierCall = mockUpdateChainNoReturning();
    mockDb.update.mockReturnValueOnce(updateAchievementsCall).mockReturnValueOnce(updateTierCall);

    const result = await updateAchievement("ach-1", {
      name: "Renamed",
      icon: "spell_holy_holybolt",
      tier: "gold",
      scope: "all_time",
    });

    expect(result).toEqual({ achievementId: "ach-1", achievementTierId: "tier-1" });
    expect(updateAchievementsCall.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Renamed", icon: "spell_holy_holybolt" }),
    );
    expect(updateTierCall.set).toHaveBeenCalledWith({ tier: "gold" });
  });
});

describe("deleteAchievement", () => {
  it("throws NOT_FOUND when the achievement doesn't exist", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce(undefined);

    await expect(deleteAchievement("missing")).rejects.toThrow(AchievementServiceError);
  });

  it("rejects deleting a rule-based achievement (INVALID)", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: "class_attendance_threshold",
      tiers: [{ id: "tier-1" }],
    });

    await expect(deleteAchievement("ach-1")).rejects.toThrow(AchievementServiceError);
  });

  it("deletes every award for the achievement's tier(s), then the achievement itself", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: null,
      tiers: [{ id: "tier-1" }],
    });
    mockDb.delete
      .mockReturnValueOnce(mockDeleteChain([{ id: "award-1" }, { id: "award-2" }]))
      .mockReturnValueOnce(mockDeleteChainNoReturning());

    const result = await deleteAchievement("ach-1");

    expect(result).toEqual({ deletedAwardCount: 2 });
  });
});

describe("grantAchievement", () => {
  it("rejects granting a rule-managed tier (ruleConfig non-null)", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({
      id: "tier-1",
      ruleConfig: { shape: "weighted_attendance_threshold", minPercent: 60, lockoutWeeks: 4 },
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
    mockDb.query.characters.findFirst.mockResolvedValue({
      characterId: 1,
      primaryCharacterId: null,
    });
    mockDb.insert.mockReturnValueOnce(mockInsertChainRejecting({ cause: { code: "23505" } }));

    await expect(
      grantAchievement({ achievementTierId: "tier-1", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects granting to a character id that doesn't exist (NOT_FOUND)", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({ id: "tier-1", ruleConfig: null });
    mockDb.query.characters.findFirst.mockResolvedValueOnce(undefined);

    await expect(
      grantAchievement({ achievementTierId: "tier-1", primaryCharacterId: 999 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("normalizes a secondary character's id to its family's primary id before persisting", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({ id: "tier-1", ruleConfig: null });
    // characterId 55 is a secondary whose family primary is 42.
    mockDb.query.characters.findFirst.mockResolvedValueOnce({
      characterId: 55,
      primaryCharacterId: 42,
    });
    const values = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "a" }]) });
    mockDb.insert.mockReturnValueOnce({ values });

    await grantAchievement({ achievementTierId: "tier-1", primaryCharacterId: 55 }, "user-1");

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ primaryCharacterId: 42 }));
  });

  it("succeeds granting the same tier to two different families", async () => {
    mockDb.query.achievementTiers.findFirst.mockResolvedValue({ id: "tier-1", ruleConfig: null });
    mockDb.query.characters.findFirst.mockResolvedValue({
      characterId: 1,
      primaryCharacterId: null,
    });
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

describe("grantCustomAchievement", () => {
  it("throws NOT_FOUND when the achievement doesn't exist", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce(undefined);

    await expect(
      grantCustomAchievement({ achievementId: "missing", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects a rule-based achievement (INVALID)", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: "class_attendance_threshold",
      tiers: [{ id: "tier-1" }],
    });

    await expect(
      grantCustomAchievement({ achievementId: "ach-1", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("rejects an achievement without exactly one tier (INVALID)", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: null,
      tiers: [{ id: "tier-1" }, { id: "tier-2" }],
    });

    await expect(
      grantCustomAchievement({ achievementId: "ach-1", primaryCharacterId: 1 }, "user-1"),
    ).rejects.toThrow(AchievementServiceError);
  });

  it("resolves the achievement's single tier and delegates to grantAchievement", async () => {
    mockDb.query.achievements.findFirst.mockResolvedValueOnce({
      id: "ach-1",
      ruleShape: null,
      tiers: [{ id: "tier-1" }],
    });
    mockDb.query.achievementTiers.findFirst.mockResolvedValueOnce({
      id: "tier-1",
      ruleConfig: null,
    });
    mockDb.query.characters.findFirst.mockResolvedValueOnce({
      characterId: 1,
      primaryCharacterId: null,
    });
    mockDb.insert.mockReturnValueOnce(mockInsertChain([{ id: "award-1" }]));

    const result = await grantCustomAchievement(
      { achievementId: "ach-1", primaryCharacterId: 1 },
      "user-1",
    );

    expect(result).toEqual({ achievementAwardId: "award-1" });
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
