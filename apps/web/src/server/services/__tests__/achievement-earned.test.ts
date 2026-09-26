import { describe, expect, it } from "vitest";
import { getEarnedAchievements } from "~/server/services/achievement-queries";

// getEarnedAchievements takes `db` as an injected param, so tests pass a fake exposing just the
// relational query it uses — same convention as achievement-queries.test.ts.
interface FakeAward {
  awardedAt: Date;
  source: "rule" | "manual";
  achievementTier: {
    tier: string;
    ruleConfig: { shape: string; minCount: number; lockoutWeeks?: number } | null;
    achievement: {
      id: string;
      name: string;
      icon: string;
      description: string | null;
      scope: "season" | "all_time";
      hidden: boolean;
      season: { name: string } | null;
    };
  };
}

function fakeDb(awards: FakeAward[]) {
  return { query: { achievementAwards: { findMany: async () => awards } } } as never;
}

const ACHIEVEMENTS = {
  dragon: {
    id: "a-dragon",
    name: "Dragonslayer",
    icon: "inv_misc_head_dragon_01",
    description: "Killed dragons {minCount} time{minCount:s} {window}.",
    scope: "season" as const,
    hidden: false,
    season: { name: "Season 2" },
  },
  secret: {
    id: "a-secret",
    name: "Secret Handshake",
    icon: "inv_misc_key_01",
    description: "You know what you did.",
    scope: "all_time" as const,
    hidden: true,
    season: null,
  },
};

function award(
  key: keyof typeof ACHIEVEMENTS,
  tier: string,
  minCount: number | null,
  awardedAt: string,
  source: "rule" | "manual" = "rule",
): FakeAward {
  return {
    awardedAt: new Date(awardedAt),
    source,
    achievementTier: {
      tier,
      ruleConfig: minCount === null ? null : { shape: "consistency_match", minCount },
      achievement: ACHIEVEMENTS[key],
    },
  };
}

describe("getEarnedAchievements", () => {
  it("returns an empty list for a family with no awards", async () => {
    expect(await getEarnedAchievements(fakeDb([]), 1)).toEqual([]);
  });

  it("folds every tier of one achievement into a single entry, lowest tier first", async () => {
    const result = await getEarnedAchievements(
      fakeDb([
        award("dragon", "gold", 10, "2026-09-03T00:00:00Z"),
        award("dragon", "copper", 1, "2026-09-01T00:00:00Z"),
        award("dragon", "silver", 5, "2026-09-02T00:00:00Z"),
      ]),
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      achievementId: "a-dragon",
      name: "Dragonslayer",
      seasonName: "Season 2",
      scope: "season",
      hidden: false,
      highestTier: "gold",
    });
    expect(result[0]!.tiers.map((t) => t.tier)).toEqual(["copper", "silver", "gold"]);
  });

  it("resolves the description against the highest earned tier, not the first row seen", async () => {
    const result = await getEarnedAchievements(
      fakeDb([
        award("dragon", "gold", 10, "2026-09-03T00:00:00Z"),
        award("dragon", "copper", 1, "2026-09-01T00:00:00Z"),
      ]),
      1,
    );
    expect(result[0]!.description).toContain("10 times");
    expect(result[0]!.description).not.toContain("1 time ");
  });

  it("keeps a manually granted tier, with its source", async () => {
    const result = await getEarnedAchievements(
      fakeDb([award("secret", "gold", null, "2026-09-04T00:00:00Z", "manual")]),
      1,
    );
    expect(result[0]).toMatchObject({
      name: "Secret Handshake",
      hidden: true,
      seasonName: null,
      description: "You know what you did.",
      highestTier: "gold",
    });
    expect(result[0]!.tiers).toEqual([
      { tier: "gold", awardedAt: new Date("2026-09-04T00:00:00Z"), source: "manual" },
    ]);
  });

  it("orders by highest tier first, then name", async () => {
    const result = await getEarnedAchievements(
      fakeDb([
        award("dragon", "copper", 1, "2026-09-01T00:00:00Z"),
        award("secret", "gold", null, "2026-09-02T00:00:00Z", "manual"),
      ]),
      1,
    );
    expect(result.map((a) => a.name)).toEqual(["Secret Handshake", "Dragonslayer"]);
  });
});
