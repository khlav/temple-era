import { describe, expect, it } from "vitest";
import { CORE_ACHIEVEMENT_ORDER, compareCoreAchievements } from "~/lib/achievement-order";

describe("compareCoreAchievements", () => {
  it("sorts the Core line into the curated order", () => {
    const shuffled = [...CORE_ACHIEVEMENT_ORDER].reverse().map((name) => ({ name }));
    expect(shuffled.sort(compareCoreAchievements).map((a) => a.name)).toEqual([
      "For the Horde",
      "Steadfast",
      "Flexible",
      "On Deck",
      "Flameeater",
      "Dragonslayer",
      "Exterminator",
      "Plaguebreaker",
    ]);
  });

  it("puts an unlisted achievement last, keeping incoming order among unlisted ones", () => {
    const input = ["Zeta", "Plaguebreaker", "Alpha", "For the Horde"].map((name) => ({ name }));
    expect(input.sort(compareCoreAchievements).map((a) => a.name)).toEqual([
      "For the Horde",
      "Plaguebreaker",
      "Zeta",
      "Alpha",
    ]);
  });
});
