// One-time bootstrap for the achievement feature on a database that has none of it yet (prod, or
// a dev DB freshly cloned from prod). Run via:
//   doppler run -- npx tsx apps/web/scripts/bootstrap-achievements.ts
//
// Order matters: the season row must exist before seedAchievementDefinitions (season-scoped
// achievements need a real seasonId), everything else is independent. Idempotent as a whole —
// each step guards itself and re-running after a partial or full prior run converges safely:
//   1. Season row       — upsert by name, matching the SEASON_2 constant exactly.
//   2. Core/Class/hidden — seedAchievementDefinitions(), which skips per-definition names that
//                          already exist rather than the whole batch, so a prior run that died
//                          partway through still converges to the full catalog on retry.
//   3. Guild Armorist    — insert-if-missing at a fixed ID, rule-based from creation (no legacy
//                          custom-achievement history to convert, unlike the tradeskill 8).
//   4. Tradeskill 8       — convertOrCreateTradeskillAchievements() (backfill-tradeskill-tiers.ts).
//   5. Recipe evaluation  — evaluateRecipeSetThresholdAwards(), covers Guild Armorist + the 8.
//   6. Full evaluation    — evaluateAchievementsForFamilies() across every family in the guild, so
//                          Core/Class/hidden achievements aren't just seeded definitions with zero
//                          awards until the next raid import happens to trigger the QStash hook.
//
// Step 6 is the slow part at guild scale (measured ~21 minutes against a ~1100-family prod clone)
// — it re-scores every recipe_set_threshold tier per family too (achievement-rules.ts has no
// per-shape filter on this call), which is pure wasted I/O since step 5 already granted those.
// Not worth optimizing for what's meant to be a one-time bootstrap; if this script ever needs to
// run *repeatedly* at this scale, that redundant scoring is the first thing to fix.

import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { achievements, achievementTiers, characters, seasons } from "~/server/db/schema";
import type { AchievementRuleConfig } from "~/server/db/schema";
import {
  SEASON_2,
  getAchievementDefinitions,
  seedAchievementDefinitions,
} from "~/server/services/achievement-definitions";
import { evaluateAchievementsForFamilies } from "~/server/services/achievement-rules";
import {
  convertOrCreateTradeskillAchievements,
  evaluateRecipeSetThresholdAwards,
} from "./backfill-tradeskill-tiers";

const GUILD_ARMORIST_ID = "88539c4a-d01a-4c1e-afa5-2a1ee6cd7be7";
// Union of Sew Cold (cloth frost) + Sew Natural (cloth nature) + Stitch Cold (leather/chain frost)
// — "every Nature and Frost Resistance armor recipe in the guild's catalog", not a separately
// curated list. minCount === recipeSpellIds.length: all-or-nothing, no partial-credit tier.
const GUILD_ARMORIST_RECIPE_IDS = [
  28208, 28205, 28207, 28209, 28481, 28482, 28480, 28210, 28224, 28222, 28223, 28221, 28220, 28219,
];

async function ensureSeason(): Promise<string> {
  const existing = await db.query.seasons.findFirst({ where: eq(seasons.name, SEASON_2.name) });
  if (existing) {
    console.log(`[season] "${SEASON_2.name}" already exists (${existing.id})`);
    return existing.id;
  }
  const [created] = await db
    .insert(seasons)
    .values({ name: SEASON_2.name, startDate: SEASON_2.startDate, endDate: SEASON_2.endDate })
    .returning({ id: seasons.id });
  console.log(`[season] created "${SEASON_2.name}" (${created!.id})`);
  return created!.id;
}

async function ensureCoreAndClassAchievements(seasonId: string): Promise<void> {
  // seedAchievementDefinitions is idempotent per-definition (skips names that already exist), so
  // it's always safe to call — including on a re-run after a prior call crashed partway through.
  const wantedCount = getAchievementDefinitions().length;
  const { achievementIds } = await seedAchievementDefinitions(db, seasonId);
  console.log(
    `[seed] inserted ${achievementIds.length}/${wantedCount} Core/Class/hidden achievements` +
      (achievementIds.length < wantedCount ? " (the rest already existed)" : ""),
  );
}

async function ensureGuildArmorist(): Promise<void> {
  const existing = await db.query.achievements.findFirst({
    where: eq(achievements.id, GUILD_ARMORIST_ID),
  });
  if (existing) {
    console.log(`[guild-armorist] already exists, skipped`);
    return;
  }
  const ruleConfig: AchievementRuleConfig = {
    shape: "recipe_set_threshold",
    recipeSpellIds: GUILD_ARMORIST_RECIPE_IDS,
    minCount: GUILD_ARMORIST_RECIPE_IDS.length,
  };
  await db.insert(achievements).values({
    id: GUILD_ARMORIST_ID,
    name: "Guild Armorist",
    description:
      "Has every Nature and Frost Resistance armor recipe in the guild's catalog: the full Glacial, Sylvan, Icy Scale, and Polar sets, plus Gaea's Embrace.",
    // Inert today (hidden achievements never show a "For {tier}" next-tier preview, and this is a
    // single-tier achievement with nothing above it anyway) — set for consistency with the other 8
    // Crafting achievements, and in case a lower tier is ever added below Arcanite.
    goalDescription:
      "Get every Nature and Frost Resistance armor recipe in the guild's catalog: the full Glacial, Sylvan, Icy Scale, and Polar sets, plus Gaea's Embrace.",
    icon: "inv_shield_06",
    scope: "all_time",
    seasonId: null,
    ruleShape: "recipe_set_threshold",
    hidden: true,
  });
  await db.insert(achievementTiers).values({
    achievementId: GUILD_ARMORIST_ID,
    tier: "arcanite",
    ruleConfig,
  });
  console.log("[guild-armorist] created (Arcanite, rule-based)");
}

async function evaluateAllFamilies(): Promise<void> {
  const familyRoot = sql<number>`coalesce(${characters.primaryCharacterId}, ${characters.characterId})`;
  const rows = await db
    .selectDistinct({ familyId: familyRoot })
    .from(characters)
    .where(eq(characters.isIgnored, false));
  const familyIds = rows.map((r) => r.familyId);
  console.log(`[evaluate-all] scoring ${familyIds.length} families against every achievement...`);
  const start = Date.now();
  const results = await evaluateAchievementsForFamilies(db, familyIds, new Date());
  let newAwardsTotal = 0;
  let failures = 0;
  for (const [, result] of results) {
    if ("error" in result) failures += 1;
    else newAwardsTotal += result.newAwards.length;
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[evaluate-all] done in ${elapsed}s — new awards: ${newAwardsTotal}, failures: ${failures}`,
  );
}

async function main() {
  const seasonId = await ensureSeason();
  await ensureCoreAndClassAchievements(seasonId);
  await ensureGuildArmorist();
  await convertOrCreateTradeskillAchievements();
  await evaluateRecipeSetThresholdAwards();
  await evaluateAllFamilies();
  console.log("\nBootstrap complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
