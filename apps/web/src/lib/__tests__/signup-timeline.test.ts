import { describe, expect, it } from "vitest";
import {
  buildChangeLog,
  buildTimeline,
  classifySignupBucket,
  computeCheckpointDelta,
  computeSignupStates,
  diffSnapshots,
  findPreviousCapturedIndex,
  groupByBucket,
  groupByRole,
  maxTimelineBarTotal,
  resolveSignupClass,
  resolveSignupRole,
  type TimelineSignupEntry,
} from "~/lib/signup-timeline";

function signup(overrides: Partial<TimelineSignupEntry> & { userId: string }): TimelineSignupEntry {
  return {
    name: overrides.userId,
    className: "Warrior",
    specName: "Fury",
    roleName: "Melee",
    ...overrides,
  };
}

describe("classifySignupBucket", () => {
  it("buckets Bench, Tentative/Late, Absence/Absent, and everything else", () => {
    expect(classifySignupBucket("Bench")).toBe("bench");
    expect(classifySignupBucket("Tentative")).toBe("tentative");
    expect(classifySignupBucket("Late")).toBe("tentative");
    expect(classifySignupBucket("Absence")).toBe("absent");
    expect(classifySignupBucket("Absent")).toBe("absent");
    expect(classifySignupBucket("Warrior")).toBe("confirmed");
    expect(classifySignupBucket("Tank")).toBe("confirmed");
  });
});

describe("resolveSignupClass", () => {
  it("passes real WoW classes through with normalized casing", () => {
    expect(resolveSignupClass(signup({ userId: "1", className: "warrior" }))).toBe("Warrior");
  });

  it("resolves the Tank status via specName, stripping Raid Helper's disambiguator digit", () => {
    expect(
      resolveSignupClass(signup({ userId: "1", className: "Tank", specName: "Protection1" })),
    ).toBe("Warrior");
    expect(
      resolveSignupClass(signup({ userId: "2", className: "Tank", specName: "Guardian" })),
    ).toBe("Druid");
  });

  it("returns null for non-class statuses", () => {
    expect(resolveSignupClass(signup({ userId: "1", className: "Bench" }))).toBeNull();
    expect(resolveSignupClass(signup({ userId: "2", className: "Tentative" }))).toBeNull();
    expect(resolveSignupClass(signup({ userId: "3", className: "Absence" }))).toBeNull();
  });
});

describe("resolveSignupRole", () => {
  it("trusts Raid Helper's own roleName when it matches a known role", () => {
    expect(resolveSignupRole(signup({ userId: "1", roleName: "Tanks" }), "Warrior")).toBe("Tanks");
    expect(resolveSignupRole(signup({ userId: "2", roleName: "Healers" }), "Priest")).toBe(
      "Healers",
    );
  });

  it("falls back to inferTalentRole when roleName is missing/unrecognized", () => {
    expect(
      resolveSignupRole(
        signup({ userId: "1", roleName: "", className: "Druid", specName: "Restoration" }),
        "Druid",
      ),
    ).toBe("Healers");
  });
});

describe("diffSnapshots", () => {
  it("treats everyone as an arrival when there is no prior snapshot", () => {
    const next = [signup({ userId: "1" }), signup({ userId: "2" })];
    const diff = diffSnapshots([], next);
    expect(diff.arrivals).toHaveLength(2);
    expect(diff.departures).toHaveLength(0);
  });

  it("detects arrivals and departures paired on userId, not name", () => {
    const prev = [signup({ userId: "1", name: "Old Name" })];
    const next = [signup({ userId: "1", name: "New Name" }), signup({ userId: "2" })];
    const diff = diffSnapshots(prev, next);
    expect(diff.arrivals.map((s) => s.userId)).toEqual(["2"]);
    expect(diff.departures).toHaveLength(0);
  });

  it("detects a bucket move (bench -> confirmed)", () => {
    const prev = [signup({ userId: "1", className: "Bench" })];
    const next = [signup({ userId: "1", className: "Warrior" })];
    const diff = diffSnapshots(prev, next);
    expect(diff.moves).toHaveLength(1);
    expect(diff.moves[0]?.signup.className).toBe("Warrior");
    expect(diff.moves[0]?.from.className).toBe("Bench");
    expect(diff.classSwitches).toHaveLength(0);
  });

  it("detects a class switch within the confirmed bucket", () => {
    const prev = [signup({ userId: "1", className: "Warrior" })];
    const next = [signup({ userId: "1", className: "Mage" })];
    const diff = diffSnapshots(prev, next);
    expect(diff.classSwitches).toHaveLength(1);
    expect(diff.moves).toHaveLength(0);
  });

  it("is not a move or class switch when nothing changed", () => {
    const prev = [signup({ userId: "1", className: "Warrior" })];
    const next = [signup({ userId: "1", className: "Warrior" })];
    const diff = diffSnapshots(prev, next);
    expect(diff.moves).toHaveLength(0);
    expect(diff.classSwitches).toHaveLength(0);
    expect(diff.arrivals).toHaveLength(0);
    expect(diff.departures).toHaveLength(0);
  });
});

describe("computeSignupStates", () => {
  it("marks held/new/moved/classSwitch/gone correctly", () => {
    const prev = [
      signup({ userId: "held", className: "Warrior" }),
      signup({ userId: "movedIn", className: "Bench" }),
      signup({ userId: "switched", className: "Warrior" }),
      signup({ userId: "left", className: "Warrior" }),
    ];
    const next = [
      signup({ userId: "held", className: "Warrior" }),
      signup({ userId: "movedIn", className: "Warrior" }),
      signup({ userId: "switched", className: "Mage" }),
      signup({ userId: "arrived", className: "Warrior" }),
    ];
    const states = computeSignupStates(prev, next);
    expect(states.get("held")?.state).toBe("held");
    expect(states.get("movedIn")?.state).toBe("moved");
    expect(states.get("switched")?.state).toBe("classSwitch");
    expect(states.get("arrived")?.state).toBe("new");
    expect(states.get("left")?.state).toBe("gone");
  });
});

describe("buildTimeline", () => {
  it("fills gaps as uncaptured slots and preserves checkpoint order (144h -> 0h)", () => {
    const rows = [
      {
        checkpoint: "72h" as const,
        capturedAt: new Date("2026-01-01"),
        signups: [signup({ userId: "1" })],
      },
    ];
    const slots = buildTimeline(rows, null);
    expect(slots.map((s) => s.checkpoint)).toEqual([
      "144h",
      "120h",
      "96h",
      "72h",
      "48h",
      "24h",
      "0h",
    ]);
    expect(slots[0]?.captured).toBe(false);
    expect(slots[3]?.captured).toBe(true);
    expect(slots[3]?.counts.confirmed).toBe(1);
    expect(slots[6]?.captured).toBe(false);
    expect(slots[6]?.isLive).toBe(false);
  });

  it("uses the live slot only for an uncaptured 0h", () => {
    const live = [signup({ userId: "1" })];
    const slots = buildTimeline([], live);
    expect(slots[6]?.isLive).toBe(true);
    expect(slots[6]?.signups).toBe(live);
  });

  it("prefers a real 0h capture over the live slot", () => {
    const rows = [{ checkpoint: "0h" as const, capturedAt: new Date("2026-01-01"), signups: [] }];
    const slots = buildTimeline(rows, [signup({ userId: "1" })]);
    expect(slots[6]?.captured).toBe(true);
    expect(slots[6]?.isLive).toBe(false);
  });
});

describe("findPreviousCapturedIndex", () => {
  it("skips gaps and never returns a live slot", () => {
    const slots = buildTimeline(
      [{ checkpoint: "144h" as const, capturedAt: new Date(), signups: [] }],
      [signup({ userId: "1" })],
    );
    // index 6 is the live 0h slot; nearest captured before it, skipping gaps, is index 0.
    expect(findPreviousCapturedIndex(slots, 6)).toBe(0);
    expect(findPreviousCapturedIndex(slots, 0)).toBeNull();
  });
});

describe("computeCheckpointDelta", () => {
  it("returns null for the first captured checkpoint", () => {
    const slots = buildTimeline(
      [{ checkpoint: "144h" as const, capturedAt: new Date(), signups: [signup({ userId: "1" })] }],
      null,
    );
    expect(computeCheckpointDelta(slots, 0)).toBeNull();
  });

  it("computes confirmed/bench gains and confirmed losses vs the previous captured checkpoint", () => {
    const slots = buildTimeline(
      [
        {
          checkpoint: "144h" as const,
          capturedAt: new Date("2026-01-01"),
          signups: [signup({ userId: "leaving", className: "Warrior" })],
        },
        {
          checkpoint: "72h" as const,
          capturedAt: new Date("2026-01-02"),
          signups: [
            signup({ userId: "newConfirmed", className: "Mage" }),
            signup({ userId: "newBench", className: "Bench" }),
          ],
        },
      ],
      null,
    );
    const delta = computeCheckpointDelta(slots, 3); // "72h" is index 3
    expect(delta).toEqual({ confirmedGain: 1, benchGain: 1, confirmedLoss: 1 });
  });
});

describe("maxTimelineBarTotal", () => {
  it("is the busiest captured snapshot's confirmed+bench+absent total, minimum 1", () => {
    expect(maxTimelineBarTotal(buildTimeline([], null))).toBe(1);
    const slots = buildTimeline(
      [
        {
          checkpoint: "72h" as const,
          capturedAt: new Date(),
          signups: [
            signup({ userId: "1", className: "Warrior" }),
            signup({ userId: "2", className: "Bench" }),
            signup({ userId: "3", className: "Absence" }),
          ],
        },
      ],
      null,
    );
    expect(maxTimelineBarTotal(slots)).toBe(3);
  });
});

describe("groupByRole", () => {
  it("groups confirmed signups by role then class, sorted by class headcount desc", () => {
    const signups = [
      signup({ userId: "1", className: "Warrior", roleName: "Melee" }),
      signup({ userId: "2", className: "Warrior", roleName: "Melee" }),
      signup({ userId: "3", className: "Rogue", roleName: "Melee" }),
      signup({ userId: "4", className: "Bench", roleName: "" }),
    ];
    const groups = groupByRole(signups, new Map());
    const melee = groups.find((g) => g.role === "Melee")!;
    expect(melee.byClass.map((c) => c.className)).toEqual(["Warrior", "Rogue"]);
    expect(melee.members).toHaveLength(3);
    const tanks = groups.find((g) => g.role === "Tanks")!;
    expect(tanks.members).toHaveLength(0);
  });
});

describe("groupByBucket", () => {
  it("filters to one bucket and attaches change state", () => {
    const signups = [
      signup({ userId: "1", className: "Bench" }),
      signup({ userId: "2", className: "Tentative" }),
      signup({ userId: "3", className: "Warrior" }),
    ];
    const states = new Map([["1", { state: "new" as const }]]);
    const bench = groupByBucket(signups, "bench", states);
    expect(bench).toHaveLength(1);
    expect(bench[0]?.state).toBe("new");
  });
});

describe("buildChangeLog", () => {
  it("orders rows newest-checkpoint-first and only covers captured checkpoints", () => {
    const rows = [
      {
        checkpoint: "144h" as const,
        capturedAt: new Date("2026-01-01"),
        signups: [signup({ userId: "1" })],
      },
      {
        checkpoint: "72h" as const,
        capturedAt: new Date("2026-01-02"),
        signups: [signup({ userId: "1" }), signup({ userId: "2" })],
      },
    ];
    const slots = buildTimeline(rows, null);
    const log = buildChangeLog(slots);
    // "1" arrives at 144h (first capture), "2" arrives at 72h.
    expect(log.map((r) => r.checkpoint)).toEqual(["72h", "144h"]);
    expect(log[0]?.kind).toBe("New");
    expect(log[0]?.signup.userId).toBe("2");
  });
});
