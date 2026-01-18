/**
 * SoftRes rule definitions and evaluation engine
 */

import type { SoftResRule, RuleEvaluationContext } from "./softres-rule-types";

/**
 * Restricted Naxx items requiring 50%+ raid attendance
 */
const RESTRICTED_NAXX_ITEMS = new Set([
  22802, // Kingsfall
  22807, // Wraith Blade
  22812, // Nerubian Slavemaker
  22816, // Hatchet of Sundered Bone
  22942, // The Widow's Embrace
  22954, // Kiss of the Spider
  22983, // Rime Covered Mantle
  23014, // Iblis, Blade of the Fallen Seraph
  23031, // Band of the Inevitable
  23038, // Band of Unnatural Forces
  23041, // Slayer's Crest
  23045, // Shroud of Dominion
  23047, // Eye of the Dead
  23049, // Sapphiron's Left Eye
  23050, // Cloak of the Necropolis
  23054, // Gressil, Dawn of Ruin
  23056, // Hammer of the Twisting Nether
  23070, // Leggings of Polarity
  23577, // The Hungering Cold
]);

/**
 * Check if any SR'd item is in the restricted items list
 */
function hasRestrictedNaxxItem(ctx: RuleEvaluationContext): boolean {
  return ctx.srItems.some((itemId) => RESTRICTED_NAXX_ITEMS.has(itemId));
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
 * Registry of all rules
 * Add new rules here to make them available for evaluation
 */
export const SOFTRES_RULES: SoftResRule[] = [
  firstRaidInZoneRule,
  newOrUnmatchedRaiderRule,
  restrictedItemOkRule,
  restrictedItemIneligibleRule,
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
