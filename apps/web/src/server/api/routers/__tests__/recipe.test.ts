import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

// Same environment-mocking convention as achievement.test.ts — trpc.ts/root.ts pull in modules
// (next-auth, ~/env) that fail to resolve or throw under Vitest's zero-env test conditions.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/services/achievement-evaluate-publish", () => ({
  publishAchievementEvaluate: vi.fn(),
}));

// Deliberately NOT mocking ~/server/services/achievement-rules or ~/server/db here (unlike
// achievement.test.ts): the whole point of the integration-style test below is that the real
// addRecipeToCharacter mutation and the real evaluateRecipeAchievementsForFamily run end-to-end
// against one shared fake `ctx.db`, so a Gold award actually appearing is proof the wiring works,
// not just that a function was called.
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

function makeSession(): Session {
  return {
    user: {
      id: "user-1",
      characterId: 0,
      isRaidManager: false,
      isAdmin: false,
      isSuperadmin: false,
      scopes: [],
    },
    expires: new Date(Date.now() + 1000 * 60).toISOString(),
  } as Session;
}

function callerWithDb(fakeDb: unknown) {
  const session = makeSession();
  return createCaller({
    db: fakeDb as never,
    headers: new Headers(),
    session,
    getSession: async () => session,
  });
}

// Mirrors achievement-rules.test.ts's chainable() helper — a thenable that also supports the
// query-builder methods actually exercised by the code under test.
function chainable<T>(result: T) {
  const obj = {
    from: () => obj,
    innerJoin: () => obj,
    where: () => obj,
    then: (resolve: (v: T) => void) => resolve(result),
  };
  return obj;
}

function insertChain(rows: unknown[]) {
  const chain: {
    values: () => typeof chain;
    onConflictDoNothing: () => typeof chain;
    returning: () => Promise<unknown[]>;
  } = {
    values: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => chain),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("recipe router: addRecipeToCharacter achievement hook", () => {
  it("hook: calls evaluateRecipeAchievementsForFamily with the resolved primary id for a secondary character, not the secondary's own id", async () => {
    const fakeDb = {
      query: {
        recipes: { findFirst: vi.fn().mockResolvedValue({ recipeSpellId: 100 }) },
        characters: {
          findFirst: vi.fn().mockResolvedValue({ characterId: 55, primaryCharacterId: 1 }), // secondary of family 1
        },
        characterRecipeMap: { findFirst: vi.fn().mockResolvedValue(undefined) },
        achievementTiers: { findMany: vi.fn().mockResolvedValue([]) }, // no recipe-shaped tiers at all
        achievementAwards: { findMany: vi.fn().mockResolvedValue([]) },
      },
      insert: vi.fn().mockReturnValueOnce(insertChain([{ characterId: 55, recipeSpellId: 100 }])),
    };

    const caller = callerWithDb(fakeDb);
    await caller.recipe.addRecipeToCharacter({ characterId: 55, recipeSpellId: 100 });

    // With zero recipe-shaped tiers, evaluateRecipeAchievementsForFamily short-circuits before
    // touching achievementAwards — reaching that point at all proves it ran (and ran for family 1,
    // not character 55), since achievementTiers.findMany is its very first call.
    expect(fakeDb.query.achievementTiers.findMany).toHaveBeenCalledTimes(1);
    expect(fakeDb.query.achievementAwards.findMany).not.toHaveBeenCalled();
  });

  it("hook: does NOT call the evaluator when the recipe was already mapped (early-return path)", async () => {
    const fakeDb = {
      query: {
        recipes: { findFirst: vi.fn().mockResolvedValue({ recipeSpellId: 100 }) },
        characters: {
          findFirst: vi.fn().mockResolvedValue({ characterId: 1, primaryCharacterId: null }),
        },
        characterRecipeMap: {
          findFirst: vi.fn().mockResolvedValue({ characterId: 1, recipeSpellId: 100 }), // already mapped
        },
        achievementTiers: { findMany: vi.fn() },
        achievementAwards: { findMany: vi.fn() },
      },
      insert: vi.fn(),
    };

    const caller = callerWithDb(fakeDb);
    const result = await caller.recipe.addRecipeToCharacter({ characterId: 1, recipeSpellId: 100 });

    expect(result.message).toBe("Recipe already assigned to character");
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(fakeDb.query.achievementTiers.findMany).not.toHaveBeenCalled();
  });

  it("hook (integration): adding the missing recipe to a family one recipe short of Gold results in a real Gold achievement_award row", async () => {
    const goldTier = {
      id: "tier-gold",
      achievementId: "ach-1",
      tier: "gold",
      ruleConfig: { shape: "recipe_set_threshold", recipeSpellIds: [100, 200, 300], minCount: 2 },
      achievement: { ruleShape: "recipe_set_threshold" },
    };
    const insertedAwards: Array<{ achievementTierId: string; primaryCharacterId: number }> = [];

    // The second insert call (achievementAwards) records what was inserted, so the assertion
    // below can check the real row rather than trusting a mock call.
    const insertMock = vi
      .fn()
      .mockReturnValueOnce(insertChain([{ characterId: 7, recipeSpellId: 200 }])) // characterRecipeMap insert
      .mockReturnValueOnce({
        values: vi
          .fn()
          .mockImplementation((row: { achievementTierId: string; primaryCharacterId: number }) => {
            insertedAwards.push(row);
            return {
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "award-gold" }]),
              }),
            };
          }),
      });

    const fakeDb = {
      query: {
        recipes: { findFirst: vi.fn().mockResolvedValue({ recipeSpellId: 200 }) },
        characters: {
          findFirst: vi.fn().mockResolvedValue({ characterId: 7, primaryCharacterId: null }), // its own family root
        },
        characterRecipeMap: { findFirst: vi.fn().mockResolvedValue(undefined) },
        achievementTiers: { findMany: vi.fn().mockResolvedValue([goldTier]) },
        achievementAwards: { findMany: vi.fn().mockResolvedValue([]) }, // holds nothing yet
      },
      select: vi.fn().mockReturnValueOnce(chainable([{ characterId: 7 }])), // family resolution
      selectDistinct: vi
        .fn()
        // Family already knew recipe 100; the recipe just added (200) now also counts — 2 of 3
        // known, crossing Gold's minCount of 2.
        .mockReturnValueOnce(chainable([{ recipeSpellId: 100 }, { recipeSpellId: 200 }])),
      insert: insertMock,
    };

    const caller = callerWithDb(fakeDb);
    await caller.recipe.addRecipeToCharacter({ characterId: 7, recipeSpellId: 200 });

    expect(insertedAwards).toHaveLength(1);
    expect(insertedAwards[0]).toMatchObject({
      achievementTierId: "tier-gold",
      primaryCharacterId: 7,
      source: "rule",
    });
  });
});

describe("recipe router: removeRecipeFromCharacter does not evaluate achievements", () => {
  it("no-hook: removeRecipeFromCharacter never touches achievement-rules — the award engine never revokes, so re-evaluating on removal is a guaranteed no-op by design", async () => {
    const fakeDb = {
      query: {
        achievementTiers: { findMany: vi.fn() },
        achievementAwards: { findMany: vi.fn() },
      },
      delete: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ characterId: 1 }]) }),
      }),
    };

    const caller = callerWithDb(fakeDb);
    await caller.recipe.removeRecipeFromCharacter({ characterId: 1, recipeSpellId: 100 });

    expect(fakeDb.query.achievementTiers.findMany).not.toHaveBeenCalled();
    expect(fakeDb.query.achievementAwards.findMany).not.toHaveBeenCalled();
  });
});
