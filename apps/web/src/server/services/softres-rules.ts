/**
 * SoftRes rule definitions and evaluation engine
 */

import type { SoftResRule, RuleEvaluationContext } from "./softres-rule-types";

/**
 * Restricted Naxx items requiring 50%+ raid attendance
 */
const RESTRICTED_NAXX_ITEMS = new Set([
  22807, // Wraith Blade
  22954, // Kiss of the Spider
  23046, // The Restrained Essence of Sapphiron
  23047, // Eye of the Dead
  22802, // Kingsfall
  23056, // Hammer of the Twisting Nether
  23054, // Gressil, Dawn of Ruin
  23577, // The Hungering Cold

  // // Removed 1/18/2026
  // 22812, // Nerubian Slavemaker
  // 22816, // Hatchet of Sundered Bone
  // 22942, // The Widow's Embrace
  // 22983, // Rime Covered Mantle
  // 23014, // Iblis, Blade of the Fallen Seraph
  // 23031, // Band of the Inevitable
  // 23038, // Band of Unnatural Forces
  // 23041, // Slayer's Crest
  // 23045, // Shroud of Dominion
  // 23049, // Sapphiron's Left Eye
  // 23050, // Cloak of the Necropolis
  // 23070, // Leggings of Polarity
]);

/**
 * End-game BWL items requiring 4+ logged raids in BWL
 */
const ENDGAME_BWL_ITEMS = new Set([
  19395, // Rejuvenating Gem
  19406, // Drake Fang Talisman
  19379, // Neltharion's Tear
  19363, // Crul'shorukh, Edge of Chaos
  19377, // Prestor's Talisman of Connivery
  19382, // Pure Elementium Band
]);

/**
 * End-game AQ40 items requiring 4+ logged raids in AQ40
 */
const ENDGAME_AQ40_ITEMS = new Set([
  21839, // Scepter of the False Prophet
  21581, // Gauntlets of Annihilation
  21585, // Dark Storm Gauntlets
  21126, // Death's Sting
  21620, // Ring of the Martyr
]);

/**
 * Check if any SR'd item is in the restricted items list
 */
function hasRestrictedNaxxItem(ctx: RuleEvaluationContext): boolean {
  return ctx.srItems.some((itemId) => RESTRICTED_NAXX_ITEMS.has(itemId));
}

/**
 * Check if any SR'd item is an end-game BWL item
 */
function hasEndgameBWLItem(ctx: RuleEvaluationContext): boolean {
  return ctx.srItems.some((itemId) => ENDGAME_BWL_ITEMS.has(itemId));
}

/**
 * Check if any SR'd item is an end-game AQ40 item
 */
function hasEndgameAQ40Item(ctx: RuleEvaluationContext): boolean {
  return ctx.srItems.some((itemId) => ENDGAME_AQ40_ITEMS.has(itemId));
}

/**
 * Get end-game item names from the context
 */
function getEndgameItemNames(
  ctx: RuleEvaluationContext,
  itemSet: Set<number>,
): string[] {
  return ctx.srItems
    .filter((itemId) => itemSet.has(itemId))
    .map((itemId) => ctx.srItemNames?.get(itemId) ?? `Item#${itemId}`);
}

/**
 * Rule 1: Info - First raid in this zone
 * Character has no recorded previous raids in the zone
 * Ignored when zone is null (unknown instance)
 */
const firstRaidInZoneRule: SoftResRule = {
  id: "first-raid-zone",
  name: "First raid in this zone",
  description: "Character found, but no previous raids in this zone.",
  level: "highlight",
  evaluate: (ctx) =>
    ctx.zone !== null &&
    ctx.characterId !== null &&
    ctx.totalRaidsAttendedBenched !== null &&
    ctx.zoneRaidsAttendedBenched !== null &&
    ctx.totalRaidsAttendedBenched > 0 &&
    ctx.zoneRaidsAttendedBenched === 0,
  icon: "Info",
};

/**
 * Rule 3: Warning - New or unmatched raider
 * Character from SoftRes was not found in the database
 */
const newOrUnmatchedRaiderRule: SoftResRule = {
  id: "no-database-match",
  name: "New or unmatched raider",
  description: "No recorded raid attendance in database.",
  level: "highlight",
  evaluate: (ctx) =>
    ctx.characterId === null || ctx.totalRaidsAttendedBenched === 0,
  icon: "AlertTriangle",
};

/**
 * Rule 3: Info - Restricted item (OK)
 * Character has SR'd a restricted item but has >= 50% attendance
 */
const restrictedItemOkRule: SoftResRule = {
  id: "restricted-item-ok",
  name: "Restricted SR - OK!",
  description: (ctx) => {
    const restrictedItemNames = ctx.srItems
      .filter((itemId) => RESTRICTED_NAXX_ITEMS.has(itemId))
      .map((itemId) => ctx.srItemNames?.get(itemId) ?? `Item#${itemId}`);

    return `Reserved \`${restrictedItemNames.join(", ")}\` and above 50% attendance. Good luck!!`;
  },
  level: "info",
  evaluate: (ctx) =>
    hasRestrictedNaxxItem(ctx) &&
    ctx.primaryAttendancePct !== null &&
    ctx.primaryAttendancePct >= 0.5,
  icon: "Info",
};

/**
 * Rule 4: Error - Restricted item, below 50% attendance
 * Character has SR'd a restricted item but has < 50% attendance
 */
const restrictedItemIneligibleRule: SoftResRule = {
  id: "restricted-item-ineligible",
  name: "Restricted SR - Not eligible",
  description: (ctx) => {
    const restrictedItems = ctx.srItems
      .filter((itemId) => RESTRICTED_NAXX_ITEMS.has(itemId))
      .map((itemId) => ctx.srItemNames!.get(itemId) || `Item#${itemId}`)
      .filter(Boolean);

    return `Reserved \`${restrictedItems.join(", ")}\`, but does not meet Temple raid attendance requirements (50%+).`;
  },
  level: "error",
  evaluate: (ctx) =>
    hasRestrictedNaxxItem(ctx) &&
    (ctx.primaryAttendancePct === null || ctx.primaryAttendancePct < 0.5),
  icon: "XCircle",
};

/**
 * Rule 5: Warning - Newer character, end-game item
 * Character has < 4 logged raids in current zone (or is not found) and SR'd an end-game item
 */
const newerCharacterEndgameItemRule: SoftResRule = {
  id: "newer-character-endgame-item",
  name: "Newer character, end-game item",
  description: (ctx) => {
    const raidCount = ctx.zoneRaidsAttendedBenched ?? 0;
    let itemNames: string[] = [];

    if (ctx.zone === "Blackwing Lair") {
      itemNames = getEndgameItemNames(ctx, ENDGAME_BWL_ITEMS);
    } else if (ctx.zone === "Temple of Ahn'Qiraj") {
      itemNames = getEndgameItemNames(ctx, ENDGAME_AQ40_ITEMS);
    }

    if (ctx.characterId === null) {
      return `Reserved end-game item \`${itemNames.join(", ")}\` but character not found in database.`;
    }

    return `Reserved end-game item \`${itemNames.join(", ")}\` with only ${raidCount} logged raid${raidCount === 1 ? "" : "s"} in ${ctx.zone}.`;
  },
  level: "warning",
  evaluate: (ctx) => {
    // Skip if character has 4+ raids in zone
    if (
      ctx.zoneRaidsAttendedBenched !== null &&
      ctx.zoneRaidsAttendedBenched >= 4
    ) {
      return false;
    }

    // Check if they SR'd an end-game item for this zone
    if (ctx.zone === "Blackwing Lair") {
      return hasEndgameBWLItem(ctx);
    } else if (ctx.zone === "Temple of Ahn'Qiraj") {
      return hasEndgameAQ40Item(ctx);
    }

    return false;
  },
  icon: "AlertTriangle",
};

/**
 * Registry of all rules
 * Add new rules here to make them available for evaluation
 */
export const SOFTRES_RULES: SoftResRule[] = [
  firstRaidInZoneRule,
  newOrUnmatchedRaiderRule,
  restrictedItemOkRule,
  restrictedItemIneligibleRule,
  newerCharacterEndgameItemRule,
];

/**
 * Evaluate all rules for a given context
 * Returns array of rule IDs that match
 */
export function evaluateRules(ctx: RuleEvaluationContext): string[] {
  return SOFTRES_RULES.filter((rule) => rule.evaluate(ctx)).map(
    (rule) => rule.id,
  );
}

/**
 * Get rule by ID
 */
export function getRuleById(ruleId: string): SoftResRule | undefined {
  return SOFTRES_RULES.find((rule) => rule.id === ruleId);
}

/**
 * Get all matching rules with full rule data
 */
export function getMatchingRules(ctx: RuleEvaluationContext): SoftResRule[] {
  return SOFTRES_RULES.filter((rule) => rule.evaluate(ctx));
}
