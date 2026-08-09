/**
 * Maps the `spec` field SoftRes's raid API (`GET /api/raid/{id}`) actually returns
 * for each reserved character to its class and spec name.
 *
 * These IDs are Blizzard's own canonical specialization ID enum (the same numbering
 * Warcraft Logs, Raider.io, etc. use) - confirmed by cross-checking a live raid's
 * response, e.g. spec 72 is Fury Warrior. This is a *different* namespace than
 * `class-specs.ts`'s CLASS_SPECS, whose IDs are SoftRes's own internal per-class
 * sequential IDs (10, 11, 12... used for Raid Helper spec-name matching, not
 * anything SoftRes's raid API returns) - reusing that table here previously caused
 * spec 72 to resolve to Shaman's "Elemental" (its id 72) instead of Fury, producing
 * corrupted combinations like "Warrior - Elemental" (TEMPLE-66).
 */
const SOFTRES_SPEC_ID_TO_CLASS_SPEC: Record<number, { class: string; specName: string }> = {
  62: { class: "Mage", specName: "Arcane" },
  63: { class: "Mage", specName: "Fire" },
  64: { class: "Mage", specName: "Frost" },
  65: { class: "Paladin", specName: "Holy" },
  66: { class: "Paladin", specName: "Protection" },
  70: { class: "Paladin", specName: "Retribution" },
  71: { class: "Warrior", specName: "Arms" },
  72: { class: "Warrior", specName: "Fury" },
  73: { class: "Warrior", specName: "Protection" },
  102: { class: "Druid", specName: "Balance" },
  103: { class: "Druid", specName: "Feral" },
  104: { class: "Druid", specName: "Guardian" },
  105: { class: "Druid", specName: "Restoration" },
  250: { class: "Deathknight", specName: "Blood" },
  251: { class: "Deathknight", specName: "Frost" },
  252: { class: "Deathknight", specName: "Unholy" },
  253: { class: "Hunter", specName: "Beast Mastery" },
  254: { class: "Hunter", specName: "Marksmanship" },
  255: { class: "Hunter", specName: "Survival" },
  256: { class: "Priest", specName: "Discipline" },
  257: { class: "Priest", specName: "Holy" },
  258: { class: "Priest", specName: "Shadow" },
  259: { class: "Rogue", specName: "Assassination" },
  260: { class: "Rogue", specName: "Combat" }, // id 260 is retail's "Outlaw" (renamed in Legion); Classic still calls it Combat

  261: { class: "Rogue", specName: "Subtlety" },
  262: { class: "Shaman", specName: "Elemental" },
  263: { class: "Shaman", specName: "Enhancement" },
  264: { class: "Shaman", specName: "Restoration" },
  265: { class: "Warlock", specName: "Affliction" },
  266: { class: "Warlock", specName: "Demonology" },
  267: { class: "Warlock", specName: "Destruction" },
  268: { class: "Monk", specName: "Brewmaster" },
  269: { class: "Monk", specName: "Windwalker" },
  270: { class: "Monk", specName: "Mistweaver" },
};

/**
 * Get the owning class name for a SoftRes raid API spec ID (O(1) lookup).
 */
export function getClassNameBySoftResSpecId(id: number): string | undefined {
  return SOFTRES_SPEC_ID_TO_CLASS_SPEC[id]?.class;
}

/**
 * Get the spec display name for a SoftRes raid API spec ID (O(1) lookup).
 */
export function getSpecNameBySoftResSpecId(id: number): string | undefined {
  return SOFTRES_SPEC_ID_TO_CLASS_SPEC[id]?.specName;
}
