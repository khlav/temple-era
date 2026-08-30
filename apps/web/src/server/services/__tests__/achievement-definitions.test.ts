import { afterEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: { insert: vi.fn() },
}));
vi.mock("~/server/db", () => ({ db: mockDb }));

import {
  seedAchievementDefinitions,
  getAchievementDefinitions,
} from "~/server/services/achievement-definitions";

afterEach(() => {
  vi.clearAllMocks();
});

describe("seedAchievementDefinitions", () => {
  it("sets achievement.ruleShape from the definition's own tier shape, not left null", async () => {
    const definitions = getAchievementDefinitions();
    const attendance = definitions.find((d) => d.name === "For the Horde")!;
    const expectedShape = Object.values(attendance.tiers)[0]!.shape;

    // Each seeded achievement does one insert(achievements) then one insert(achievementTiers)
    // per tier — alternate mockReturnValueOnce accordingly for the first definition only;
    // subsequent inserts reuse the same generic chain since this test only asserts on the
    // very first achievement insert's values() call.
    let achievementInsertCall: { ruleShape: string | null } | undefined;
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((values: { ruleShape?: string | null }) => {
        if (achievementInsertCall === undefined && "ruleShape" in values) {
          achievementInsertCall = values as { ruleShape: string | null };
        }
        return { returning: vi.fn().mockResolvedValue([{ id: "id-1" }]) };
      }),
    }));

    await seedAchievementDefinitions(mockDb as never, "season-1", "user-1");

    expect(achievementInsertCall?.ruleShape).toBe(expectedShape);
  });
});
