/**
 * Class specialization mappings from softres.it
 * Maps class names to their available specializations with IDs
 */

export interface ClassSpec {
  id: number;
  name: string;
  role: string;
  cssClass: string;
  iconClass: string;
  talentRole: "Tank" | "Healer" | "Melee" | "Ranged";
}

export interface ClassSpecs {
  Deathknight: ClassSpec[];
  Monk: ClassSpec[];
  Druid: ClassSpec[];
  Hunter: ClassSpec[];
  Mage: ClassSpec[];
  Priest: ClassSpec[];
  Paladin: ClassSpec[];
  Rogue: ClassSpec[];
  Shaman: ClassSpec[];
  Warlock: ClassSpec[];
  Warrior: ClassSpec[];
}

export const CLASS_SPECS: ClassSpecs = {
  Deathknight: [
    {
      id: 100,
      name: "Blood",
      role: "Deathknight",
      cssClass: "deathknight",
      iconClass: "icon_deathknight_blood",
      talentRole: "Melee",
    },
    {
      id: 101,
      name: "Frost",
      role: "Deathknight",
      cssClass: "deathknight",
      iconClass: "icon_deathknight_frost",
      talentRole: "Tank",
    },
    {
      id: 102,
      name: "Unholy",
      role: "Deathknight",
      cssClass: "deathknight",
      iconClass: "icon_deathknight_unholy",
      talentRole: "Melee",
    },
  ],
  Monk: [
    {
      id: 110,
      name: "Brewmaster",
      role: "Monk",
      cssClass: "monk",
      iconClass: "icon_monk_brewmaster",
      talentRole: "Tank",
    },
    {
      id: 111,
      name: "Mistweaver",
      role: "Monk",
      cssClass: "monk",
      iconClass: "icon_monk_mistweaver",
      talentRole: "Healer",
    },
    {
      id: 112,
      name: "Windwalker",
      role: "Monk",
      cssClass: "monk",
      iconClass: "icon_monk_windwalker",
      talentRole: "Melee",
    },
  ],
  Druid: [
    {
      id: 10,
      name: "Restoration",
      role: "Druid",
      cssClass: "druid",
      iconClass: "icon_druid_restoration",
      talentRole: "Healer",
    },
    {
      id: 11,
      name: "Bear",
      role: "Druid",
      cssClass: "druid",
      iconClass: "icon_druid_bear",
      talentRole: "Tank",
    },
    {
      id: 12,
      name: "Feral",
      role: "Druid",
      cssClass: "druid",
      iconClass: "icon_druid_feral",
      talentRole: "Melee",
    },
    {
      id: 13,
      name: "Balance",
      role: "Druid",
      cssClass: "druid",
      iconClass: "icon_druid_balance",
      talentRole: "Ranged",
    },
  ],
  Hunter: [
    {
      id: 20,
      name: "Marksmanship",
      role: "Hunter",
      cssClass: "hunter",
      iconClass: "icon_hunter_marksmanship",
      talentRole: "Ranged",
    },
    {
      id: 21,
      name: "Beast Mastery",
      role: "Hunter",
      cssClass: "hunter",
      iconClass: "icon_hunter_beastmastery",
      talentRole: "Ranged",
    },
    {
      id: 22,
      name: "Survival",
      role: "Hunter",
      cssClass: "hunter",
      iconClass: "icon_hunter_survival",
      talentRole: "Ranged",
    },
  ],
  Mage: [
    {
      id: 30,
      name: "Frost",
      role: "Mage",
      cssClass: "mage",
      iconClass: "icon_mage_frost",
      talentRole: "Ranged",
    },
    {
      id: 31,
      name: "Fire",
      role: "Mage",
      cssClass: "mage",
      iconClass: "icon_mage_fire",
      talentRole: "Ranged",
    },
    {
      id: 32,
      name: "Arcane",
      role: "Mage",
      cssClass: "mage",
      iconClass: "icon_mage_arcane",
      talentRole: "Ranged",
    },
  ],
  Priest: [
    {
      id: 40,
      name: "Holy",
      role: "Priest",
      cssClass: "priest",
      iconClass: "icon_priest_holy",
      talentRole: "Healer",
    },
    {
      id: 41,
      name: "Discipline",
      role: "Priest",
      cssClass: "priest",
      iconClass: "icon_priest_discipline",
      talentRole: "Healer",
    },
    {
      id: 42,
      name: "Shadow",
      role: "Priest",
      cssClass: "priest",
      iconClass: "icon_priest_shadow",
      talentRole: "Ranged",
    },
  ],
  Paladin: [
    {
      id: 50,
      name: "Holy",
      role: "Paladin",
      cssClass: "paladin",
      iconClass: "icon_paladin_holy",
      talentRole: "Healer",
    },
    {
      id: 51,
      name: "Protection",
      role: "Paladin",
      cssClass: "paladin",
      iconClass: "icon_paladin_protection",
      talentRole: "Tank",
    },
    {
      id: 52,
      name: "Retribution",
      role: "Paladin",
      cssClass: "paladin",
      iconClass: "icon_paladin_retribution",
      talentRole: "Melee",
    },
  ],
  Rogue: [
    {
      id: 60,
      name: "Swords",
      role: "Rogue",
      cssClass: "rogue",
      iconClass: "icon_rogue_swords",
      talentRole: "Melee",
    },
    {
      id: 61,
      name: "Daggers",
      role: "Rogue",
      cssClass: "rogue",
      iconClass: "icon_rogue_daggers",
      talentRole: "Melee",
    },
    {
      id: 62,
      name: "Maces",
      role: "Rogue",
      cssClass: "rogue",
      iconClass: "icon_rogue_maces",
      talentRole: "Melee",
    },
  ],
  Shaman: [
    {
      id: 70,
      name: "Restoration",
      role: "Shaman",
      cssClass: "shaman",
      iconClass: "icon_shaman_restoration",
      talentRole: "Healer",
    },
    {
      id: 71,
      name: "Enhancement",
      role: "Shaman",
      cssClass: "shaman",
      iconClass: "icon_shaman_enhancement",
      talentRole: "Melee",
    },
    {
      id: 72,
      name: "Elemental",
      role: "Shaman",
      cssClass: "shaman",
      iconClass: "icon_shaman_elemental",
      talentRole: "Ranged",
    },
  ],
  Warlock: [
    {
      id: 80,
      name: "Affliction",
      role: "Warlock",
      cssClass: "warlock",
      iconClass: "icon_warlock_affliction",
      talentRole: "Ranged",
    },
    {
      id: 81,
      name: "Demonology",
      role: "Warlock",
      cssClass: "warlock",
      iconClass: "icon_warlock_demonology",
      talentRole: "Ranged",
    },
    {
      id: 82,
      name: "Destruction",
      role: "Warlock",
      cssClass: "warlock",
      iconClass: "icon_warlock_destruction",
      talentRole: "Ranged",
    },
    {
      id: 83,
      name: "Hybrid",
      role: "Warlock",
      cssClass: "warlock",
      iconClass: "icon_warlock_hybrid",
      talentRole: "Ranged",
    },
    {
      id: 84,
      name: "SM Ruin",
      role: "Warlock",
      cssClass: "warlock",
      iconClass: "icon_warlock_smruin",
      talentRole: "Ranged",
    },
    {
      id: 85,
      name: "DS Ruin",
      role: "Warlock",
      cssClass: "warlock",
      iconClass: "icon_warlock_dsruin",
      talentRole: "Ranged",
    },
  ],
  Warrior: [
    {
      id: 90,
      name: "Fury",
      role: "Warrior",
      cssClass: "warrior",
      iconClass: "icon_warrior_fury",
      talentRole: "Melee",
    },
    {
      id: 91,
      name: "Protection",
      role: "Warrior",
      cssClass: "warrior",
      iconClass: "icon_warrior_protection",
      talentRole: "Tank",
    },
    {
      id: 92,
      name: "Arms",
      role: "Warrior",
      cssClass: "warrior",
      iconClass: "icon_warrior_arms",
      talentRole: "Melee",
    },
  ],
} as const;

/**
 * Get a spec by its ID
 */
export function getSpecById(id: number): ClassSpec | undefined {
  for (const specs of Object.values(CLASS_SPECS)) {
    const spec = specs.find((s: ClassSpec) => s.id === id);
    if (spec) return spec;
  }
  return undefined;
}

/**
 * Get all specs for a class
 */
export function getSpecsByClass(className: keyof ClassSpecs): ClassSpec[] {
  return CLASS_SPECS[className] ?? [];
}

/**
 * Get spec name by ID
 */
export function getSpecNameById(id: number): string | undefined {
  return getSpecById(id)?.name;
}
