import { describe, expect, it, vi } from "vitest";
import { getAchievementLogPage } from "~/server/services/achievement-queries";

// achievement-queries.ts takes `db` as an injected param (not a module-level import), so — per
// this file's own convention (see withRarity's doc comment) — tests pass a lightweight fake
// directly rather than vi.mock("~/server/db").
function chainable<T>(result: T) {
  const obj = {
    from: () => obj,
    innerJoin: () => obj,
    where: () => obj,
    groupBy: () => obj,
    orderBy: () => obj,
    limit: () => obj,
    offset: () => obj,
    then: (resolve: (v: T) => void) => resolve(result),
  };
  return obj;
}

interface FakeAwardRow {
  day: string;
  achievementTierId: string;
  latestAwardedAt: string;
  tier: string;
  ruleConfig: null;
  name: string;
  icon: string;
  hidden: boolean;
  description: string | null;
  scope: "season" | "all_time";
  characterIds: number[];
  awardIds: string[];
}

interface FakeCharacterRow {
  characterId: number;
  name: string;
  class: string;
}

function buildFakeDb(opts: { awardRows: FakeAwardRow[]; characterRows: FakeCharacterRow[] }) {
  const select = vi
    .fn()
    .mockReturnValueOnce(chainable(opts.awardRows))
    .mockReturnValueOnce(chainable(opts.characterRows));
  return { select } as never;
}

const BASE_ROW: Omit<FakeAwardRow, "day" | "achievementTierId" | "characterIds" | "awardIds"> = {
  latestAwardedAt: "2026-09-01 20:00:00-04",
  tier: "gold",
  ruleConfig: null,
  name: "Dragonslayer",
  icon: "inv_misc_head_dragon_01",
  hidden: false,
  description: "Killed a dragon.",
  scope: "season",
};

describe("getAchievementLogPage", () => {
  it("collapses multiple same-day earners of the same tier into one entry", async () => {
    const db = buildFakeDb({
      awardRows: [
        {
          ...BASE_ROW,
          day: "2026-09-01",
          achievementTierId: "tier-1",
          characterIds: [1, 2],
          awardIds: ["award-1", "award-2"],
        },
      ],
      characterRows: [
        { characterId: 1, name: "Alice", class: "warrior" },
        { characterId: 2, name: "Bob", class: "mage" },
      ],
    });

    const { entries, hasMore } = await getAchievementLogPage(db, { limit: 50, offset: 0 });

    expect(hasMore).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "Dragonslayer",
      tier: "gold",
      replayAwardId: "award-1",
    });
    expect(entries[0]!.earners.map((e) => e.name)).toEqual(["Alice", "Bob"]);
  });

  it("renders a hidden achievement fully, unmasked — the log deliberately doesn't hide these", async () => {
    const db = buildFakeDb({
      awardRows: [
        {
          ...BASE_ROW,
          day: "2026-09-01",
          achievementTierId: "tier-hidden",
          tier: "arcanite",
          name: "Legendary Feat",
          icon: "inv_misc_orb_04",
          hidden: true,
          description: null,
          scope: "all_time",
          characterIds: [1],
          awardIds: ["award-1"],
        },
      ],
      characterRows: [{ characterId: 1, name: "Alice", class: "warrior" }],
    });

    const { entries } = await getAchievementLogPage(db, { limit: 50, offset: 0 });

    expect(entries[0]).toMatchObject({ name: "Legendary Feat", hidden: true });
  });

  it("reports hasMore when more rows than the page limit come back", async () => {
    const rowFor = (i: number): FakeAwardRow => ({
      ...BASE_ROW,
      day: "2026-09-01",
      achievementTierId: `tier-${i}`,
      characterIds: [1],
      awardIds: [`award-${i}`],
    });
    const db = buildFakeDb({
      awardRows: [rowFor(1), rowFor(2)],
      characterRows: [{ characterId: 1, name: "Alice", class: "warrior" }],
    });

    const { entries, hasMore } = await getAchievementLogPage(db, { limit: 1, offset: 0 });

    expect(hasMore).toBe(true);
    expect(entries).toHaveLength(1);
  });

  it("returns an empty page without querying character names when there are no awards", async () => {
    const db = buildFakeDb({ awardRows: [], characterRows: [] });

    const { entries, hasMore } = await getAchievementLogPage(db, { limit: 50, offset: 0 });

    expect(entries).toEqual([]);
    expect(hasMore).toBe(false);
  });
});
