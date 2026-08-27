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
  markAchievementAwardsSeen: vi.fn(),
  resolveSessionPrimaryCharacterId: vi.fn(),
  listAchievements: vi.fn(),
  listAwardsForFamily: vi.fn(),
  createSeason: vi.fn(),
  listSeasons: vi.fn(),
}));

// achievement-queries.ts is NOT mocked — its db-injected functions (getUnseenAwards,
// getDisplayCatalog, getAwardById) run for real against a fake db passed via callerWithDb below,
// per the spec's own Pattern to follow (achievement-rules.ts's DI convention). Only the rule-tier
// lookups it composes (achievement-rules.ts) are mocked, so these tests exercise achievement-
// queries' own hidden-exclusion/ordering logic without needing a full rule-engine fixture.
vi.mock("~/server/services/achievement-rules", () => ({
  getHighestTierPerAchievement: vi.fn(),
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
  markAchievementAwardsSeen as mockMarkAchievementAwardsSeen,
  resolveSessionPrimaryCharacterId as mockResolveSessionPrimaryCharacterId,
  createSeason as mockCreateSeason,
} from "~/server/services/achievement-service";
import {
  getHighestTierPerAchievement as mockGetHighestTierPerAchievement,
  getNextTierProgress as mockGetNextTierProgress,
} from "~/server/services/achievement-rules";

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
        tier: "bronze",
        scope: "all_time",
        hidden: false,
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
      tier: "bronze",
      scope: "all_time",
      hidden: false,
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

  it("manual-grant: createSeason rejects a session without achievement:manage", async () => {
    const caller = callerWithScopes([]);
    await expect(
      caller.achievement.createSeason({ name: "Season 2", startDate: new Date() }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockCreateSeason).not.toHaveBeenCalled();
  });

  it("manual-grant: createSeason succeeds for a session with achievement:manage", async () => {
    vi.mocked(mockCreateSeason).mockResolvedValue({
      id: "season-1",
      name: "Season 2",
      startDate: new Date("2026-09-01"),
      endDate: null,
      createdById: "user-1",
      createdAt: new Date(),
      updatedAt: null,
    });
    const caller = callerWithScopes([SCOPE.ACHIEVEMENT_MANAGE]);
    const result = await caller.achievement.createSeason({
      name: "Season 2",
      startDate: new Date("2026-09-01"),
    });
    expect(result.id).toBe("season-1");
    expect(mockCreateSeason).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Season 2" }),
      "user-1",
    );
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

describe("achievement-queries", () => {
  it("display-catalog: a hidden achievement with zero awards for the family never appears in either bucket", async () => {
    vi.mocked(mockGetHighestTierPerAchievement).mockResolvedValue(new Map());
    const fakeDb = { query: { achievements: { findMany: vi.fn().mockResolvedValueOnce([]) } } };
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.hiddenEarned).toEqual([]);
    expect(fakeDb.query.achievements.findMany).toHaveBeenCalledTimes(1); // hidden query never ran
  });

  it("display-catalog: the same achievement, after being earned, appears in hiddenEarned with progress null", async () => {
    vi.mocked(mockGetHighestTierPerAchievement).mockResolvedValue(
      new Map([["ach-hidden", "bronze"]]),
    );
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([]) // visible
      .mockResolvedValueOnce([{ id: "ach-hidden", name: "Secret", icon: "trophy", hidden: true }]); // hidden, earned
    const fakeDb = { query: { achievements: { findMany } } };
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.hiddenEarned).toEqual([
      {
        achievementId: "ach-hidden",
        name: "Secret",
        icon: "trophy",
        highestTierEarned: "bronze",
        progress: null,
      },
    ]);
    expect(mockGetNextTierProgress).not.toHaveBeenCalled();
  });

  it("display-catalog: a visible achievement at platinum has progress null, not an error", async () => {
    vi.mocked(mockGetHighestTierPerAchievement).mockResolvedValue(new Map([["ach-1", "platinum"]]));
    vi.mocked(mockGetNextTierProgress).mockResolvedValue(null); // maxed out
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "ach-1", name: "Attendance", icon: "calendar-check", hidden: false },
      ])
      .mockResolvedValueOnce([]);
    const fakeDb = { query: { achievements: { findMany } } };
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getDisplayCatalog({ primaryCharacterId: 1 });

    expect(result.visible).toEqual([
      {
        achievementId: "ach-1",
        name: "Attendance",
        icon: "calendar-check",
        highestTierEarned: "platinum",
        progress: null,
      },
    ]);
  });

  it("getUnseenAwards orders platinum before gold before silver before bronze, most-recent first within a tier", async () => {
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
              row("platinum-1", "platinum", "2026-08-05"),
              row("silver-new", "silver", "2026-08-15"),
            ]),
        },
      },
    };
    vi.mocked(mockResolveSessionPrimaryCharacterId).mockResolvedValue(1);
    const caller = callerWithDb([], fakeDb);

    const result = await caller.achievement.getUnseenAwards();

    expect(result.map((a) => a.achievementAwardId)).toEqual([
      "platinum-1",
      "gold-1",
      "silver-new",
      "silver-old",
    ]);
  });
});
