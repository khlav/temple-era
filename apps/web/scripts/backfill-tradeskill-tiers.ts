// Ensures the 8 tradeskill mastery achievements exist as rule-based `recipe_set_threshold`
// achievements — either by converting a pre-existing one-tier custom (manual-grant) row in place,
// or, on a database that has none of them yet (a fresh prod bootstrap), inserting them fresh at
// their fixed IDs. Also runs the shared evaluation pass for every `recipe_set_threshold`
// achievement in the DB (not just these 8 — see step 3 below). Run standalone via:
//   doppler run -- npx tsx apps/web/scripts/backfill-tradeskill-tiers.ts
// or import `convertOrCreateTradeskillAchievements`/`evaluateRecipeSetThresholdAwards` from a
// larger bootstrap script (see bootstrap-achievements.ts).
//
// Idempotent per achievement, not just per full run: the achievement-row upsert uses
// onConflictDoUpdate, and which thorium action to take (create it fresh / demote an existing
// arcanite row / leave an already-converted one alone) is decided from that achievement's actual
// tier state, not from whether the achievement row itself exists — so a run interrupted at any
// point (crash between the achievement insert and its tier insert included) converges to the same
// finished shape on retry instead of getting stuck reporting "already converted" for an
// achievement that in fact has no tier at all. The Gold-tier insert uses onConflictDoNothing
// against achievement_tier's (achievementId, tier) unique index, and the evaluation pass only
// ever inserts award rows that don't already exist.
//
// Mid-build correction: dev's existing single tier on all 8 achievements was found to be
// `arcanite`, not `thorium` as originally planned. Resolved with the user: demote the existing
// tier row's `tier` value to `thorium` (same achievement_tier.id — existing awards/awardedAt/
// source untouched, only the enum value changes) and add a new `gold` tier below it for the 6
// graduated achievements. A database that never had the old custom achievements (prod) has
// nothing to demote — it gets the Thorium/Gold tiers inserted directly instead.

import { eq, and, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  achievements,
  achievementTiers,
  achievementAwards,
  characters,
  characterRecipeMap,
} from "~/server/db/schema";
import type { AchievementRuleConfig } from "~/server/db/schema";

interface AchievementConfig {
  name: string;
  icon: string;
  recipeSpellIds: number[];
  goldMinCount: number | null; // null = stays single-tier (Thorium only)
  description: string;
  goalDescription: string;
}

// Icons: real Wowhead texture names for a representative recipe/item per achievement (verified
// live against nether.wowhead.com's tooltip API, same source used elsewhere in this codebase),
// not guessed — see achievement-description.ts and the Fullmetal Zug icon fix earlier this session
// for the same pattern.
export const ACHIEVEMENTS: Record<string, AchievementConfig> = {
  "06d68bcf-e3a9-4e6b-9d62-bdc4bdc599be": {
    name: "Flaskmaster",
    icon: "inv_potion_62",
    recipeSpellIds: [17635, 17636, 17637],
    goldMinCount: 2,
    description:
      "Has {countPhrase} key flask recipes: Titans, Distilled Wisdom, and Supreme Power.",
    goalDescription:
      "Get {countPhrase} key flask recipes: Titans, Distilled Wisdom, and Supreme Power.",
  },
  "d418a4cb-3f83-46e5-a657-b2b86774d6ec": {
    name: "Fullmetal Zug",
    icon: "inv_helmet_36",
    recipeSpellIds: [16729, 16741, 27829],
    goldMinCount: 2,
    description:
      "Has {countPhrase} key plate plans: Lionheart Helm, Titanic Leggings, and Stronghold Gauntlets.",
    goalDescription:
      "Get {countPhrase} key plate plans: Lionheart Helm, Titanic Leggings, and Stronghold Gauntlets.",
  },
  "497f1d1e-9747-4edb-a909-e52591c4b57b": {
    name: "Glow Up",
    icon: "spell_holy_greaterheal",
    recipeSpellIds: [20034, 20025, 23802, 25079, 22750, 22749],
    goldMinCount: 3,
    description:
      "Has {countPhrase} key raid enchants: Crusader, Greater Stats (Chest), Healing Power (Bracer, Gloves, Weapon), and Spellpower (Weapon).",
    goalDescription:
      "Get {countPhrase} key raid enchants: Crusader, Greater Stats (Chest), Healing Power (Bracer, Gloves, Weapon), and Spellpower (Weapon).",
  },
  "0164a7f1-321c-4fbd-86be-03de62e6128c": {
    name: "Sew Cold",
    icon: "inv_chest_cloth_08",
    recipeSpellIds: [28208, 28205, 28207, 28209],
    goldMinCount: 2,
    description:
      "Has {countPhrase} key cloth frost-resist patterns: Cloak, Gloves, Vest, and Wrists.",
    goalDescription:
      "Get {countPhrase} key cloth frost-resist patterns: Cloak, Gloves, Vest, and Wrists.",
  },
  "cdb3bc09-e47c-4d0f-b2ab-e1b8b21edfd1": {
    name: "Sew Natural",
    icon: "inv_chest_plate07",
    recipeSpellIds: [28481, 28482, 28480, 28210],
    goldMinCount: 2,
    description:
      "Has {countPhrase} key nature-resist patterns: the Sylvan Crown, Shoulders, and Vest, plus Gaea's Embrace.",
    goalDescription:
      "Get {countPhrase} key nature-resist patterns: the Sylvan Crown, Shoulders, and Vest, plus Gaea's Embrace.",
  },
  "365d3c49-2808-4303-aa0b-45ebe8f632b0": {
    name: "Stitch Cold",
    icon: "inv_chest_plate09", // Icy Scale Breastplate (item 22664) — verified via Wowhead's tooltip API
    recipeSpellIds: [28224, 28222, 28223, 28221, 28220, 28219],
    goldMinCount: 3,
    description:
      "Has {countPhrase} key leather/chain frost-resist patterns: the Icy Scale set (Bracers, Breastplate, Gauntlets) and the Polar set (Bracers, Gloves, Tunic).",
    goalDescription:
      "Get {countPhrase} key leather/chain frost-resist patterns: the Icy Scale set (Bracers, Breastplate, Gauntlets) and the Polar set (Bracers, Gloves, Tunic).",
  },
  "2a3dae46-664e-40a9-8eae-f153b26d9801": {
    name: "Cloakweaver",
    icon: "inv_misc_cape_05",
    recipeSpellIds: [18418, 19093],
    goldMinCount: null,
    description: "Has both Cindercloth Cloak and Onyxia Scale Cloak recipes.",
    goalDescription: "Get both Cindercloth Cloak and Onyxia Scale Cloak recipes.",
  },
  "a7dc6aec-9053-48c7-9a4c-b55dacc26397": {
    name: "Resto is Best-o",
    icon: "inv_misc_cape_01",
    recipeSpellIds: [22927, 23709],
    goldMinCount: null,
    description: "Has both Corehound Belt and Hide of the Wild recipes.",
    goalDescription: "Get both Corehound Belt and Hide of the Wild recipes.",
  },
};

/** Steps 1+2: ensure every achievement in ACHIEVEMENTS exists as a rule-based `recipe_set_threshold`
 *  achievement at its fixed ID, then logs a pre/post award-count diff. Three cases per achievement:
 *  (a) doesn't exist yet — insert fresh with a Thorium tier (and Gold, if configured); (b) exists
 *  with its old single `arcanite` tier — demote that tier to Thorium and add Gold; (c) already
 *  converted — no-op. */
export async function convertOrCreateTradeskillAchievements(): Promise<void> {
  const preSnapshot = new Map<string, number>();
  // Captured here and reused below rather than re-derived per achievement in the second loop —
  // also fixes a real gap: branching the second loop on "does the achievement row exist" (as
  // opposed to "does its thorium tier exist") meant a run that crashed after inserting the
  // achievement row but before its tier row would, on retry, land in the convert branch, find no
  // `arcanite` tier to demote, log "already converted", and leave the achievement permanently
  // tier-less. Branching on tier state directly makes every combination — no achievement row, row
  // but no tier, or a real arcanite-to-demote — converge to the same finished shape.
  const tierStateByAchievementId = new Map<
    string,
    { arcaneTier: { id: string } | null; thoriumTier: { id: string } | null }
  >();
  for (const [achievementId, cfg] of Object.entries(ACHIEVEMENTS)) {
    const arcaneTier = await db.query.achievementTiers.findFirst({
      where: and(
        eq(achievementTiers.achievementId, achievementId),
        eq(achievementTiers.tier, "arcanite"),
      ),
    });
    const thoriumTier = arcaneTier
      ? null
      : await db.query.achievementTiers.findFirst({
          where: and(
            eq(achievementTiers.achievementId, achievementId),
            eq(achievementTiers.tier, "thorium"),
          ),
        });
    tierStateByAchievementId.set(achievementId, {
      arcaneTier: arcaneTier ?? null,
      thoriumTier: thoriumTier ?? null,
    });
    const existingTier = arcaneTier ?? thoriumTier;
    const awardCount = existingTier
      ? await db.query.achievementAwards.findMany({
          where: eq(achievementAwards.achievementTierId, existingTier.id),
          columns: { id: true },
        })
      : [];
    preSnapshot.set(achievementId, awardCount.length);
    console.log(
      existingTier
        ? `[snapshot] ${cfg.name}: ${awardCount.length} existing award(s) on tier ${existingTier.tier}`
        : `[snapshot] ${cfg.name}: no existing tier row (fresh bootstrap or a prior interrupted run)`,
    );
  }

  for (const [achievementId, cfg] of Object.entries(ACHIEVEMENTS)) {
    const thoriumConfig: AchievementRuleConfig = {
      shape: "recipe_set_threshold",
      recipeSpellIds: cfg.recipeSpellIds,
      minCount: cfg.recipeSpellIds.length,
    };
    const goldConfig: AchievementRuleConfig | null =
      cfg.goldMinCount === null
        ? null
        : {
            shape: "recipe_set_threshold",
            recipeSpellIds: cfg.recipeSpellIds,
            minCount: cfg.goldMinCount,
          };

    // hidden: false — these render in their own always-visible "Professions" section
    // (achievement-display.tsx), not folded into the earned-only Legendary Feats bucket.
    // scope: "all_time" — tradeskill mastery isn't a per-season grind, so seasonId stays null
    // regardless of whether a season row exists yet.
    await db
      .insert(achievements)
      .values({
        id: achievementId,
        name: cfg.name,
        description: cfg.description,
        goalDescription: cfg.goalDescription,
        icon: cfg.icon,
        scope: "all_time",
        seasonId: null,
        ruleShape: "recipe_set_threshold",
        hidden: false,
      })
      .onConflictDoUpdate({
        target: achievements.id,
        set: {
          ruleShape: "recipe_set_threshold",
          hidden: false,
          description: cfg.description,
          goalDescription: cfg.goalDescription,
          icon: cfg.icon,
        },
      });

    const { arcaneTier, thoriumTier } = tierStateByAchievementId.get(achievementId)!;
    let thoriumAction: "created" | "demoted" | "already-thorium";
    if (thoriumTier) {
      thoriumAction = "already-thorium";
    } else if (arcaneTier) {
      await db
        .update(achievementTiers)
        .set({ tier: "thorium", ruleConfig: thoriumConfig })
        .where(eq(achievementTiers.id, arcaneTier.id));
      thoriumAction = "demoted";
    } else {
      await db
        .insert(achievementTiers)
        .values({ achievementId, tier: "thorium", ruleConfig: thoriumConfig });
      thoriumAction = "created";
    }

    if (goldConfig) {
      await db
        .insert(achievementTiers)
        .values({ achievementId, tier: "gold", ruleConfig: goldConfig })
        .onConflictDoNothing({ target: [achievementTiers.achievementId, achievementTiers.tier] });
    }

    console.log(
      `[convert] ${cfg.name}: thorium tier ${thoriumAction}${goldConfig ? ", gold tier ensured" : ""}`,
    );
  }

  console.log("\n--- Post-migration Thorium award counts (should match snapshot above) ---");
  for (const [achievementId, cfg] of Object.entries(ACHIEVEMENTS)) {
    const thoriumTier = await db.query.achievementTiers.findFirst({
      where: and(
        eq(achievementTiers.achievementId, achievementId),
        eq(achievementTiers.tier, "thorium"),
      ),
    });
    if (!thoriumTier) {
      console.error(`[verify] ${cfg.name}: no thorium tier found post-migration!`);
      continue;
    }
    const postCount = await db.query.achievementAwards.findMany({
      where: eq(achievementAwards.achievementTierId, thoriumTier.id),
      columns: { id: true },
    });
    const pre = preSnapshot.get(achievementId) ?? 0;
    const status = postCount.length >= pre ? "OK" : "REGRESSION";
    console.log(`[verify] ${cfg.name}: pre=${pre} post=${postCount.length} [${status}]`);
  }
}

/** Step 3: grant any newly-qualifying awards across every `recipe_set_threshold` achievement in
 *  the DB — not just the 8 in ACHIEVEMENTS. Scoped by ruleShape rather than Object.keys(ACHIEVEMENTS)
 *  so an achievement that's already rule-based from creation (Guild Armorist — never goes through
 *  convertOrCreateTradeskillAchievements, just gets its ruleConfig set directly) still gets picked
 *  up here, and so does any future recipe_set_threshold achievement with zero further script changes.
 *
 *  A one-time bulk backfill across every family in the guild is a fundamentally different shape of
 *  problem than the addRecipeToCharacter hook's single-family case — evaluateRecipeAchievementsForFamilies
 *  (achievement-rules.ts) is correctly optimized for the hook (fetches shared facts once, then
 *  scores per family), but scoring itself is still 2 queries × tier × family, which is thousands of
 *  sequential round trips at guild scale and took several minutes without finishing. This instead
 *  does the whole thing in 2 queries total: one fetching every (family, known recipe) pair across
 *  all tracked recipes at once, then all the counting/threshold comparison happens in memory before
 *  a single batched insert. */
export async function evaluateRecipeSetThresholdAwards(): Promise<number> {
  const allTiers = await db.query.achievementTiers.findMany({
    where: (tier, { isNotNull }) => isNotNull(tier.ruleConfig),
    with: { achievement: true },
  });
  const recipeTiers = allTiers.filter((t) => t.achievement.ruleShape === "recipe_set_threshold");

  const allRecipeIds = [
    ...new Set(
      recipeTiers.flatMap(
        (t) =>
          (t.ruleConfig as Extract<AchievementRuleConfig, { shape: "recipe_set_threshold" }>)
            .recipeSpellIds,
      ),
    ),
  ];

  const familyRecipeRows =
    allRecipeIds.length === 0
      ? []
      : await db
          .select({
            characterId: characters.characterId,
            primaryCharacterId: characters.primaryCharacterId,
            recipeSpellId: characterRecipeMap.recipeSpellId,
          })
          .from(characterRecipeMap)
          .innerJoin(characters, eq(characterRecipeMap.characterId, characters.characterId))
          .where(inArray(characterRecipeMap.recipeSpellId, allRecipeIds));

  const knownByFamily = new Map<number, Set<number>>();
  for (const row of familyRecipeRows) {
    const familyId = row.primaryCharacterId ?? row.characterId;
    if (!knownByFamily.has(familyId)) knownByFamily.set(familyId, new Set());
    knownByFamily.get(familyId)!.add(row.recipeSpellId);
  }
  const existingAwardRows =
    recipeTiers.length === 0
      ? []
      : await db.query.achievementAwards.findMany({
          where: inArray(
            achievementAwards.achievementTierId,
            recipeTiers.map((t) => t.id),
          ),
          columns: { achievementTierId: true, primaryCharacterId: true },
        });
  const alreadyAwardedKeys = new Set(
    existingAwardRows.map((a) => `${a.achievementTierId}:${a.primaryCharacterId}`),
  );

  const asOf = new Date();
  const newAwardRows: Array<{
    achievementTierId: string;
    primaryCharacterId: number;
    source: "rule";
    awardedAt: Date;
  }> = [];
  for (const tier of recipeTiers) {
    const config = tier.ruleConfig as Extract<
      AchievementRuleConfig,
      { shape: "recipe_set_threshold" }
    >;
    for (const [familyId, known] of knownByFamily) {
      if (alreadyAwardedKeys.has(`${tier.id}:${familyId}`)) continue;
      const current = config.recipeSpellIds.filter((id) => known.has(id)).length;
      if (current < config.minCount) continue;
      newAwardRows.push({
        achievementTierId: tier.id,
        primaryCharacterId: familyId,
        source: "rule",
        awardedAt: asOf,
      });
    }
  }

  if (newAwardRows.length > 0) {
    await db
      .insert(achievementAwards)
      .values(newAwardRows)
      .onConflictDoNothing({
        target: [achievementAwards.achievementTierId, achievementAwards.primaryCharacterId],
      });
  }
  console.log(`[evaluate] total new awards granted: ${newAwardRows.length}`);
  return newAwardRows.length;
}

// Only auto-run when this file is the actual entrypoint (tsx invoking it directly) — not when
// bootstrap-achievements.ts imports convertOrCreateTradeskillAchievements/evaluateRecipeSetThresholdAwards.
if (import.meta.url === `file://${process.argv[1]}`) {
  convertOrCreateTradeskillAchievements()
    .then(() => evaluateRecipeSetThresholdAwards())
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
