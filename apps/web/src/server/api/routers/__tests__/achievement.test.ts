import { afterEach, describe, expect, it, vi } from "vitest";
import type { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { SCOPE } from "~/lib/scopes";

// trpc.ts imports `auth` from ~/server/auth at module scope, which pulls in next-auth — whose
// installed beta version fails to resolve `next/server` under Vitest's Node environment (an
// environment issue, not anything to do with this router). No router-level test exists yet in
// this codebase for exactly this reason; mocking the import prevents the real module from ever
// loading, without needing auth() to behave any particular way (this test never calls it —
// sessions are injected directly via the caller's ctx.getSession below).
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));

// This file only exercises router wiring (scope gating, session-to-service argument passing) —
// real DB-touching service logic (season validation, rule-managed-tier rejection, unique-
// constraint mapping, mark-seen idempotency) lives in
// src/server/services/__tests__/achievement-service.test.ts instead. Mocking the whole service
// module here AND importing the real one there would otherwise collide on the same module
// instance — vi.mock affects every import of a given path within a test file.
vi.mock("~/server/services/achievement-service", () => ({
  createAchievement: vi.fn(),
  grantAchievement: vi.fn(),
  revokeAward: vi.fn(),
  markAchievementAwardsSeen: vi.fn(),
  resolveSessionPrimaryCharacterId: vi.fn(),
  listAchievements: vi.fn(),
  listAwardsForFamily: vi.fn(),
  listSeasons: vi.fn(),
}));

// achievement-queries.ts is NOT mocked — its db-injected functions (getUnseenAwards,
// getDisplayCatalog, getAwardById) run for real against a fake db passed via callerWithDb below,
// per the spec's own Pattern to follow (achievement-rules.ts's DI convention). getDisplayCatalog
// no longer calls into achievement-rules.ts at all (it derives highest-tier-per-achievement
// itself, now that it also needs each award's id) — getNextTierProgress stays mocked here only
// because a couple of assertions below confirm it's still never called from the display path.
vi.mock("~/server/services/achievement-rules", () => ({
  getNextTierProgress: vi.fn(),
}));

// createCaller (below) statically imports every router in root.ts, including raidlog.ts and
// raid.ts — both of which now import achievement-evaluate-publish.ts, which imports ~/env.
// CI's Test step runs with zero env vars set (SKIP_ENV_VALIDATION is only set on the later
// Build step), so an unmocked ~/env import throws at module-evaluation time, before any test
// in this file runs. Mocking it here follows the same convention this codebase already uses
// for ~/server/db (see raidlog.ts's own tests) — this file has no reason to exercise the real
// QStash-publish side effect anyway.
vi.mock("~/server/services/achievement-evaluate-publish", () => ({
  publishAchievementEvaluate: vi.fn(),
}));

// A pre-existing gap, not introduced by this phase: root.ts also registers discord.ts and
// search.ts, both of which already import the real `db` singleton from ~/server/db at module
// scope (unconditionally, unrelated to anything achievement-specific). That singleton's own
// module imports ~/env, so createCaller has always thrown under true zero-env conditions —
// this file just never actually ran that way until this phase's CI-mirroring repro caught it.
// Every test below injects its own fake db via callerWithDb, so the real module is never
// otherwise touched; mocking it here only prevents the module from loading at all.
vi.mock("~/server/db", () => ({ db: {} }));

// trpc.ts itself (unavoidably imported — it's the router machinery createCaller and every
// router are built on) also imports ~/env directly at module scope, for a query-logging
// helper (isLocalDatabase) that's try/catch-guarded and never exercised by these tests.
// Same pre-existing gap as above, one level deeper — mocking ~/env directly is the only way
// to satisfy it without mocking trpc.ts itself (which would break the actual scope-gating
// behavior these tests exist to verify).
vi.mock("~/env", () => ({ env: {} }));

import { createCaller } from "~/server/api/root";
import {
  createAchievement as mockCreateAchievement,
  grantAchievement as mockGrantAchievement,
  revokeAward as mockRevokeAward,
  markAchievementAwardsSeen as mockMarkAchievementAwardsSeen,
  resolveSessionPrimaryCharacterId as mockResolveSessionPrimaryCharacterId,
  listAwardsForFamily as mockListAwardsForFamily,
} from "~/server/services/achievement-service";
import { getNextTierProgress as mockGetNextTierProgress } from "~/server/services/achievement-rules";

const TIER_ID_1 = "00000000-0000-4000-8000-000000000001";
const AWARD_ID_1 = "00000000-0000-4000-8000-0000000000a1";
const AWARD_ID_2 = "00000000-0000-4000-8000-0000000000a2";

function makeSession(scopes: string[]): Session {
  return {
    user: { id: "user-1", scopes },
    expires: new Date(Date.now() + 1000 * 60).toISOString(),
  } as Session;
}

function callerWithScopes(scopes: string[]) {
  const session = makeSession(scopes);
  return createCaller({
    db: {} as never,
    headers: new Headers(),
    session,
    getSession: async () => session,
  });
}

/** Same as callerWithScopes, but with a real (fake) db object instead of `{}` — for the three
 *  query procedures that call achievement-queries.ts's real, db-injected functions. */
function callerWithDb(scopes: string[], fakeDb: unknown) {
  const session = makeSession(scopes);
  return createCaller({
    db: fakeDb as never,
    headers: new Headers(),
    session,
    getSession: async () => session,
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("achievement router: manual-grant scope gating", () => {
  it("manual-grant: createAchievement rejects a session without achievement:manage", async () => {
    const caller = callerWithScopes([]);
    await expect(
      caller.achievement.createAchievement({
        name: "Test",
        icon: "trophy",
        tier: "copper",
        scope: "all_time",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TRPCError>);
    expect(mockCreateAchievement).not.toHaveBeenCalled();
  });

  it("manual-grant: grantAchievement rejects a session without achievement:manage", async () => {
    const caller = callerWithScopes([]);
    await expect(
      caller.achievement.grantAchievement({ achievementTierId: TIER_ID_1, primaryCharacterId: 1 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockGrantAchievement).not.toHaveBeenCalled();
  });

  it("manual-grant: createAchievement succeeds for a session with achievement:manage", async () => {
    vi.mocked(mockCreateAchievement).mockResolvedValue({
      achievementId: "ach-1",
      achievementTierId: "tier-1",
    });
    const caller = callerWithScopes([SCOPE.ACHIEVEMENT_MANAGE]);
    const result = await caller.achievement.createAchievement({
      name: "Test",
      icon: "trophy",
      tier: "copper",
      scope: "all_time",
    });
    expect(result).toEqual({ achievementId: "ach-1", achievementTierId: "tier-1" });
    expect(mockCreateAchievement).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test", scope: "all_time" }),
      "user-1",
    );
  });

  it("manual-grant: the same definition can be granted to multiple different families over time, each grant its own achievement_award row", async () => {
    vi.mocked(mockGrantAchievement)
      .mockResolvedValueOnce({ achievementAwardId: "award-1" })
      .mockResolvedValueOnce({ achievementAwardId: "award-2" });
    const caller = callerWithScopes([SCOPE.ACHIEVEMENT_MANAGE]);

    const first = await caller.achievement.grantAchievement({
      achievementTierId: TIER_ID_1,
      primaryCharacterId: 101,
    });
    const second = await caller.achievement.grantAchievement({
      achievementTierId: TIER_ID_1,
      primaryCharacterId: 202,
    });

    expect(first.achievementAwardId).not.toBe(second.achievementAwardId);
    expect(mockGrantAchievement).toHaveBeenCalledTimes(2);
  });

  it("manual-grant: revokeAward rejects a session without achievement:manage", async () => {
    const caller = callerWithScopes([]);
    await expect(
      caller.achievement.revokeAward({ achievementAwardId: AWARD_ID_1 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockRevokeAward).not.toHaveBeenCalled();
  });

  it("manual-grant: revokeAward succeeds for a session with achievement:manage", async () => {
    vi.mocked(mockRevokeAward).mockResolvedValue({ revokedAwardIds: [AWARD_ID_1] });
    const caller = callerWithScopes([SCOPE.ACHIEVEMENT_MANAGE]);

    const result = await caller.achievement.revokeAward({ achievementAwardId: AWARD_ID_1 });

    expect(result).toEqual({ revokedAwardIds: [AWARD_ID_1] });
    expect(mockRevokeAward).toHaveBeenCalledWith(AWARD_ID_1);
  });
});

describe("achievement router: getAdminCatalog", () => {
  it("rejects a session without achievement:manage", async () => {
    const caller = callerWithScopes([]);
    await expect(caller.achievement.getAdminCatalog()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("shapes one achievement's tiers and holders from the nested query result", async () => {
    const fakeDb = {
      query: {
        achievements: {
          findMany: vi.fn().mockResolvedValueOnce([
            {
              id: "ach-1",
              name: "Steadfast",
              description: "Attended{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
              icon: "inv_shield_26",
              scope: "season",
              season: { name: "Season 2" },
              hidden: false,
              ruleShape: "consistency_match",
              tiers: [
                {
                  id: "tier-1",
                  tier: "copper",
                  ruleConfig: { shape: "consistency_match", minCount: 1 },
                  awards: [
                    {
                      id: AWARD_ID_1,
                      primaryCharacterId: 1,
                      source: "rule",
                      awardedAt: new Date("2026-09-10"),
                      primaryCharacter: { characterId: 1, name: "Zazanoo", class: "Warrior" },
                    },
                  ],
                },
              ],
            },
          ]),
        },
      },
    };
    const caller = callerWithDb([SCOPE.ACHIEVEMENT_MANAGE], fakeDb);

    const result = await caller.achievement.getAdminCatalog();

    expect(result).toEqual([
      {
        achievementId: "ach-1",
        name: "Steadfast",
        description: "Attended{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
        icon: "inv_shield_26",
        scope: "season",
        seasonName: "Season 2",
        hidden: false,
        ruleShape: "consistency_match",
        tiers: [
          {
            achievementTierId: "tier-1",
            tier: "copper",
            isManual: false,
            description: "Attended.",
            holders: [
              {
                achievementAwardId: AWARD_ID_1,
                primaryCharacterId: 1,
                characterName: "Zazanoo",
                characterClass: "Warrior",
                source: "rule",
                awardedAt: new Date("2026-09-10"),
              },
            ],
          },
        ],
      },
    ]);
  });

  it("shows a holder only under the highest tier they've earned, not every tier crossed along the way", async () => {
    const fakeDb = {
      query: {
        achievements: {
          findMany: vi.fn().mockResolvedValueOnce([
            {
              id: "ach-1",
              name: "Shapeshifter",
              description: null,
              icon: "ability_mage_improvedpolymorph",
              scope: "season",
              season: { name: "Season 2" },
              hidden: true,
              ruleShape: "class_breadth_window",
              tiers: [
                {
                  id: "tier-copper",
                  tier: "copper",
                  ruleConfig: { shape: "class_breadth_window", minDistinctClasses: 1 },
                  awards: [],
                },
                {
                  id: "tier-silver",
                  tier: "silver",
                  ruleConfig: { shape: "class_breadth_window", minDistinctClasses: 2 },
                  awards: [
                    {
                      id: AWARD_ID_1,
                      primaryCharacterId: 1,
                      source: "rule",
                      awardedAt: new Date("2026-09-10"),
                      primaryCharacter: { characterId: 1, name: "Zazanoo", class: "Warrior" },
                    },
                  ],
                },
                {
                  id: "tier-gold",
                  tier: "gold",
                  ruleConfig: { shape: "class_breadth_window", minDistinctClasses: 4 },
                  awards: [
                    {
                      id: AWARD_ID_2,
                      primaryCharacterId: 1,
                      source: "rule",
                      awardedAt: new Date("2026-09-12"),
                      primaryCharacter: { characterId: 1, name: "Zazanoo", class: "Warrior" },
                    },
                  ],
                },
              ],
            },
          ]),
        },
      },
    };
    const caller = callerWithDb([SCOPE.ACHIEVEMENT_MANAGE], fakeDb);

    const result = await caller.achievement.getAdminCatalog();

    const holdersByTier = Object.fromEntries(
      result[0]!.tiers.map((t) => [t.tier, t.holders.map((h) => h.characterName)]),
    );
    expect(holdersByTier).toEqual({ copper: [], silver: [], gold: ["Zazanoo"] });
  });
});

describe("achievement router: mark-seen", () => {
  it("mark-seen: resolves the caller's own primaryCharacterId and marks only their awards", async () => {
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(42);
    vi.mocked(mockMarkAchievementAwardsSeen).mockResolvedValue({ updated: 2 });
    const caller = callerWithScopes([]); // markSeen is NOT scope-gated

    const result = await caller.achievement.markSeen({
      achievementAwardIds: [AWARD_ID_1, AWARD_ID_2],
    });

    expect(result).toEqual({ updated: 2 });
    expect(mockResolveSessionPrimaryCharacterId).toHaveBeenCalledWith("user-1");
    expect(mockMarkAchievementAwardsSeen).toHaveBeenCalledWith([AWARD_ID_1, AWARD_ID_2], 42);
  });

  it("mark-seen: a session with no linked character marks nothing rather than erroring", async () => {
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(null);
    const caller = callerWithScopes([]);

    const result = await caller.achievement.markSeen({ achievementAwardIds: [AWARD_ID_1] });

    expect(result).toEqual({ updated: 0 });
    expect(mockMarkAchievementAwardsSeen).not.toHaveBeenCalled();
  });
});

describe("achievement router: getUnseenAwards", () => {
  it("resolves the caller's own primaryCharacterId before querying awards", async () => {
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(null);
    const caller = callerWithScopes([]);

    const result = await caller.achievement.getUnseenAwards();

    expect(result).toEqual([]);
    expect(mockResolveSessionPrimaryCharacterId).toHaveBeenCalledWith("user-1");
  });
});

describe("achievement router: listAwardsForFamily", () => {
  it("takes no input — always resolves the caller's own primaryCharacterId, never an arbitrary one, since awards carry private per-account state (seenAt, awardedByUserId)", async () => {
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(42);
    vi.mocked(mockListAwardsForFamily).mockResolvedValue([]);
    const caller = callerWithScopes([]);

    await caller.achievement.listAwardsForFamily();

    expect(mockResolveSessionPrimaryCharacterId).toHaveBeenCalledWith("user-1");
    expect(mockListAwardsForFamily).toHaveBeenCalledWith(42);
  });

  it("returns an empty list rather than throwing when the caller has no linked character", async () => {
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(null);
    const caller = callerWithScopes([]);

    const result = await caller.achievement.listAwardsForFamily();

    expect(result).toEqual([]);
    expect(mockListAwardsForFamily).not.toHaveBeenCalled();
  });
});

describe("achievement-queries", () => {
  it("display-catalog: works for a signed-out caller — the character page shows a viewed character's real achievements without requiring a session", async () => {
    const fakeDb = {
      query: {
        achievementAwards: { findMany: vi.fn().mockResolvedValueOnce([]) },
        achievements: { findMany: vi.fn().mockResolvedValueOnce([]) },
      },
    };
    const caller = createCaller({
      db: fakeDb as never,
      headers: new Headers(),
      session: null,
      getSession: async () => null,
    });

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.hiddenEarned).toEqual([]);
  });

  it("award-by-id: works for a signed-out caller — the character page's replay click must not require a session", async () => {
    const fakeDb = {
      query: {
        achievementAwards: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: AWARD_ID_1,
            awardedAt: new Date("2026-09-10"),
            achievementTier: {
              achievementId: "ach-1",
              tier: "copper",
              ruleConfig: null,
              achievement: {
                name: "Steadfast",
                icon: "inv_shield_26",
                description: null,
                scope: "season",
              },
            },
          }),
        },
      },
    };
    const caller = createCaller({
      db: fakeDb as never,
      headers: new Headers(),
      session: null,
      getSession: async () => null,
    });

    const result = await caller.achievement.getAwardById({ achievementAwardId: AWARD_ID_1 });

    expect(result?.name).toBe("Steadfast");
  });

  it("display-catalog: a hidden achievement with zero awards for the family never appears in either bucket", async () => {
    const fakeDb = {
      query: {
        achievementAwards: { findMany: vi.fn().mockResolvedValueOnce([]) },
        achievements: { findMany: vi.fn().mockResolvedValueOnce([]) },
      },
    };
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.hiddenEarned).toEqual([]);
    expect(fakeDb.query.achievements.findMany).toHaveBeenCalledTimes(1); // hidden query never ran
  });

  it("display-catalog: the same achievement, after being earned, appears in hiddenEarned with progress null", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([]) // visible
      .mockResolvedValueOnce([
        { id: "ach-hidden", name: "Secret", icon: "trophy", hidden: true, tiers: [] },
      ]); // hidden, earned
    const fakeDb = {
      query: {
        achievementAwards: {
          findMany: vi.fn().mockResolvedValueOnce([
            {
              id: "award-hidden-1",
              achievementTier: { achievementId: "ach-hidden", tier: "copper" },
            },
          ]),
        },
        achievements: { findMany },
      },
    };
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.hiddenEarned).toEqual([
      {
        achievementId: "ach-hidden",
        name: "Secret",
        icon: "trophy",
        description: "",
        wowClass: null,
        highestTierEarned: "copper",
        achievementAwardId: "award-hidden-1",
        nextTier: null,
        nextTierDescription: null,
        progress: null,
      },
    ]);
    expect(mockGetNextTierProgress).not.toHaveBeenCalled();
  });

  it("display-catalog: a visible achievement at thorium has progress null, not an error", async () => {
    vi.mocked(mockGetNextTierProgress).mockResolvedValue(null); // maxed out
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "ach-1", name: "Attendance", icon: "calendar-check", hidden: false, tiers: [] },
      ])
      .mockResolvedValueOnce([]);
    const fakeDb = {
      query: {
        achievementAwards: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              { id: "award-1", achievementTier: { achievementId: "ach-1", tier: "thorium" } },
            ]),
        },
        achievements: { findMany },
      },
    };
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.visible).toEqual([
      {
        achievementId: "ach-1",
        name: "Attendance",
        icon: "calendar-check",
        description: "",
        wowClass: null,
        highestTierEarned: "thorium",
        achievementAwardId: "award-1",
        nextTier: null,
        nextTierDescription: null,
        progress: null,
      },
    ]);
  });

  it("getUnseenAwards orders thorium before gold before silver before copper, most-recent first within a tier", async () => {
    const row = (id: string, tier: string, awardedAt: string) => ({
      id,
      awardedAt: new Date(awardedAt),
      achievementTier: {
        tier,
        achievementId: `ach-${id}`,
        achievement: { name: id, icon: "trophy" },
      },
    });
    const fakeDb = {
      query: {
        achievementAwards: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              row("silver-old", "silver", "2026-08-01"),
              row("gold-1", "gold", "2026-08-10"),
              row("thorium-1", "thorium", "2026-08-05"),
              row("silver-new", "silver", "2026-08-15"),
            ]),
        },
      },
    };
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(1);
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getUnseenAwards();

    expect(result.map((a) => a.achievementAwardId)).toEqual([
      "thorium-1",
      "gold-1",
      "silver-new",
      "silver-old",
    ]);
  });
});
