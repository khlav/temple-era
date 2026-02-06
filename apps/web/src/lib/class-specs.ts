/**
 * Class specialization mappings from softres.it
 * Maps class names to their available specializations with IDs
 */

export interface ClassSpec {
  id: number;
  name: string;
  role: string;
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
      talentRole: "Melee",
    },
    {
      id: 101,
      name: "Frost",
      role: "Deathknight",
      talentRole: "Tank",
    },
    {
      id: 102,
      name: "Unholy",
      role: "Deathknight",
      talentRole: "Melee",
    },
  ],
  Monk: [
    {
      id: 110,
      name: "Brewmaster",
      role: "Monk",
      talentRole: "Tank",
    },
    {
      id: 111,
      name: "Mistweaver",
      role: "Monk",
      talentRole: "Healer",
    },
    {
      id: 112,
      name: "Windwalker",
      role: "Monk",
      talentRole: "Melee",
    },
  ],
  Druid: [
    {
      id: 10,
      name: "Restoration",
      role: "Druid",
      talentRole: "Healer",
    },
    {
      id: 11,
      name: "Bear",
      role: "Druid",
      talentRole: "Tank",
    },
    {
      id: 12,
      name: "Feral",
      role: "Druid",
      talentRole: "Melee",
    },
    {
      id: 13,
      name: "Balance",
      role: "Druid",
      talentRole: "Ranged",
    },
  ],
  Hunter: [
    {
      id: 20,
      name: "Marksmanship",
      role: "Hunter",
      talentRole: "Ranged",
    },
    {
      id: 21,
      name: "Beast Mastery",
      role: "Hunter",
      talentRole: "Ranged",
    },
    {
      id: 22,
      name: "Survival",
      role: "Hunter",
      talentRole: "Ranged",
    },
  ],
  Mage: [
    {
      id: 30,
      name: "Frost",
      role: "Mage",
      talentRole: "Ranged",
    },
    {
      id: 31,
      name: "Fire",
      role: "Mage",
      talentRole: "Ranged",
    },
    {
      id: 32,
      name: "Arcane",
      role: "Mage",
      talentRole: "Ranged",
    },
  ],
  Priest: [
    {
      id: 40,
      name: "Holy",
      role: "Priest",
      talentRole: "Healer",
    },
    {
      id: 41,
      name: "Discipline",
      role: "Priest",
      talentRole: "Healer",
    },
    {
      id: 42,
      name: "Shadow",
      role: "Priest",
      talentRole: "Ranged",
    },
  ],
  Paladin: [
    {
      id: 50,
      name: "Holy",
      role: "Paladin",
      talentRole: "Healer",
    },
    {
      id: 51,
      name: "Protection",
      role: "Paladin",
      talentRole: "Tank",
    },
    {
      id: 52,
      name: "Retribution",
      role: "Paladin",
      talentRole: "Melee",
    },
  ],
  Rogue: [
    {
      id: 60,
      name: "Swords",
      role: "Rogue",
      talentRole: "Melee",
    },
    {
      id: 61,
      name: "Daggers",
      role: "Rogue",
      talentRole: "Melee",
    },
    {
      id: 62,
      name: "Maces",
      role: "Rogue",
      talentRole: "Melee",
    },
  ],
  Shaman: [
    {
      id: 70,
      name: "Restoration",
      role: "Shaman",
      talentRole: "Healer",
    },
    {
      id: 71,
      name: "Enhancement",
      role: "Shaman",
      talentRole: "Melee",
    },
    {
      id: 72,
      name: "Elemental",
      role: "Shaman",
      talentRole: "Ranged",
    },
  ],
  Warlock: [
    {
      id: 80,
      name: "Affliction",
      role: "Warlock",
      talentRole: "Ranged",
    },
    {
      id: 81,
      name: "Demonology",
      role: "Warlock",
      talentRole: "Ranged",
    },
    {
      id: 82,
      name: "Destruction",
      role: "Warlock",
      talentRole: "Ranged",
    },
    {
      id: 83,
      name: "Hybrid",
      role: "Warlock",
      talentRole: "Ranged",
    },
    {
      id: 84,
      name: "SM Ruin",
      role: "Warlock",
      talentRole: "Ranged",
    },
    {
      id: 85,
      name: "DS Ruin",
      role: "Warlock",
      talentRole: "Ranged",
    },
  ],
  Warrior: [
    {
      id: 90,
      name: "Fury",
      role: "Warrior",
      talentRole: "Melee",
    },
    {
      id: 91,
      name: "Protection",
      role: "Warrior",
      talentRole: "Tank",
    },
    {
      id: 92,
      name: "Arms",
      role: "Warrior",
      talentRole: "Melee",
    },
  ],
} as const;

/**
 * Map of spec ID to ClassSpec for O(1) lookup
 * Built once at module load time
 */
const SPEC_BY_ID_MAP = new Map<number, ClassSpec>();

// Build the map from CLASS_SPECS
for (const specs of Object.values(CLASS_SPECS)) {
  for (const spec of specs) {
    SPEC_BY_ID_MAP.set(spec.id, spec);
  }
}

/**
 * Get a spec by its ID (O(1) lookup)
 */
export function getSpecById(id: number): ClassSpec | undefined {
  return SPEC_BY_ID_MAP.get(id);
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

/**
 * Get talent role by spec ID
 */
export function getTalentRoleBySpecId(
  specId: number,
): "Tank" | "Healer" | "Melee" | "Ranged" | undefined {
  return getSpecById(specId)?.talentRole;
}
