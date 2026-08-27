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

import { createCaller } from "~/server/api/root";
import {
  createAchievement as mockCreateAchievement,
  grantAchievement as mockGrantAchievement,
  markAchievementAwardsSeen as mockMarkAchievementAwardsSeen,
  resolveSessionPrimaryCharacterId as mockResolveSessionPrimaryCharacterId,
  createSeason as mockCreateSeason,
} from "~/server/services/achievement-service";

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
