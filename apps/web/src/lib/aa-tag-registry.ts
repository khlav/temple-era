/**
 * AA Tag Registry
 *
 * Provides a categorized, searchable registry of all available AA template tags.
 * Built from the existing tag maps in aa-formatting.ts.
 */

import type { AAIconType } from "./aa-formatting";
import {
  AA_RAID_MARKERS,
  AA_ROLE_ICONS,
  AA_CLASS_ICONS,
  AA_TEXTURE_TAGS,
  AA_ARROW_ICONS,
  AA_COLORS,
  AA_CLASS_COLORS,
  RAID_MARKER_ALIASES,
} from "./aa-formatting";

export interface AATagEntry {
  tag: string;
  displayName: string;
  category: string;
  iconType: AAIconType | "arrow";
  iconName: string;
}

export interface AATagCategory {
  key: string;
  label: string;
  entries: AATagEntry[];
}

// Tags to skip from texture map (already covered by dedicated categories or are aliases)
const TEXTURE_SKIP_TAGS = new Set([
  // Classes handled by AA_CLASS_ICONS or dedicated texture entries
  "dk",
  "deathknight",
  "dh",
  "demonhunter",
  "monk",
  "evoker",
]);

// Categorization of texture tags by class/group
const TEXTURE_CATEGORIES: Record<string, { category: string; label: string }> =
  {
    // Warrior
    sunder: { category: "warrior", label: "Warrior" },
    aoe: { category: "warrior", label: "Warrior" },
    shout: { category: "warrior", label: "Warrior" },
    mock: { category: "warrior", label: "Warrior" },
    pummel: { category: "warrior", label: "Warrior" },
    taunt: { category: "warrior", label: "Warrior" },
    demo: { category: "warrior", label: "Warrior" },
    thunder: { category: "warrior", label: "Warrior" },
    sw: { category: "warrior", label: "Warrior" },
    ls: { category: "warrior", label: "Warrior" },
    reflect: { category: "warrior", label: "Warrior" },
    // Priest
    mc: { category: "priest", label: "Priest" },
    pi: { category: "priest", label: "Priest" },
    fw: { category: "priest", label: "Priest" },
    shackle: { category: "priest", label: "Priest" },
    dispel: { category: "priest", label: "Priest" },
    "pw:s": { category: "priest", label: "Priest" },
    renew: { category: "priest", label: "Priest" },
    fort: { category: "priest", label: "Priest" },
    spirit: { category: "priest", label: "Priest" },
    shadow: { category: "priest", label: "Priest" },
    fade: { category: "priest", label: "Priest" },
    mds: { category: "priest", label: "Priest" },
    // Druid
    ff: { category: "druid", label: "Druid" },
    innerv: { category: "druid", label: "Druid" },
    innervate: { category: "druid", label: "Druid" },
    br: { category: "druid", label: "Druid" },
    rebirth: { category: "druid", label: "Druid" },
    remove: { category: "druid", label: "Druid" },
    rejuv: { category: "druid", label: "Druid" },
    abolish: { category: "druid", label: "Druid" },
    gotw: { category: "druid", label: "Druid" },
    thorns: { category: "druid", label: "Druid" },
    bark: { category: "druid", label: "Druid" },
    barkskin: { category: "druid", label: "Druid" },
    // Paladin
    jol: { category: "paladin", label: "Paladin" },
    jow: { category: "paladin", label: "Paladin" },
    joj: { category: "paladin", label: "Paladin" },
    bop: { category: "paladin", label: "Paladin" },
    bof: { category: "paladin", label: "Paladin" },
    di: { category: "paladin", label: "Paladin" },
    ds: { category: "paladin", label: "Paladin" },
    sac: { category: "paladin", label: "Paladin" },
    cleanse: { category: "paladin", label: "Paladin" },
    loh: { category: "paladin", label: "Paladin" },
    bok: { category: "paladin", label: "Paladin" },
    bow: { category: "paladin", label: "Paladin" },
    bol: { category: "paladin", label: "Paladin" },
    salv: { category: "paladin", label: "Paladin" },
    sanc: { category: "paladin", label: "Paladin" },
    // Mage
    cs: { category: "mage", label: "Mage" },
    counterspell: { category: "mage", label: "Mage" },
    sheep: { category: "mage", label: "Mage" },
    polymorph: { category: "mage", label: "Mage" },
    pig: { category: "mage", label: "Mage" },
    turtle: { category: "mage", label: "Mage" },
    decurse: { category: "mage", label: "Mage" },
    ai: { category: "mage", label: "Mage" },
    dampen: { category: "mage", label: "Mage" },
    amplify: { category: "mage", label: "Mage" },
    block: { category: "mage", label: "Mage" },
    // Warlock
    coe: { category: "warlock", label: "Warlock" },
    cos: { category: "warlock", label: "Warlock" },
    cor: { category: "warlock", label: "Warlock" },
    ss: { category: "warlock", label: "Warlock" },
    soulstone: { category: "warlock", label: "Warlock" },
    banish: { category: "warlock", label: "Warlock" },
    seed: { category: "warlock", label: "Warlock" },
    // Hunter
    tranq: { category: "hunter", label: "Hunter" },
    mark: { category: "hunter", label: "Hunter" },
    md: { category: "hunter", label: "Hunter" },
    misdirection: { category: "hunter", label: "Hunter" },
    trap: { category: "hunter", label: "Hunter" },
    // Shaman
    es: { category: "shaman", label: "Shaman" },
    wf: { category: "shaman", label: "Shaman" },
    tremor: { category: "shaman", label: "Shaman" },
    // Rogue
    kick: { category: "rogue", label: "Rogue" },
    feint: { category: "rogue", label: "Rogue" },
    cloak: { category: "rogue", label: "Rogue" },
    blind: { category: "rogue", label: "Rogue" },
    cheap: { category: "rogue", label: "Rogue" },
    kidney: { category: "rogue", label: "Rogue" },
    // Consumables
    lip: { category: "consumables", label: "Consumables" },
    stone: { category: "consumables", label: "Consumables" },
    fap: { category: "consumables", label: "Consumables" },
    petri: { category: "consumables", label: "Consumables" },
    "holy water": { category: "consumables", label: "Consumables" },
    // Boss Icons
    rag: { category: "bosses", label: "Boss Icons" },
    nef: { category: "bosses", label: "Boss Icons" },
    ony: { category: "bosses", label: "Boss Icons" },
    hakkar: { category: "bosses", label: "Boss Icons" },
    cthun: { category: "bosses", label: "Boss Icons" },
    kt: { category: "bosses", label: "Boss Icons" },
    sapph: { category: "bosses", label: "Boss Icons" },
    patch: { category: "bosses", label: "Boss Icons" },
    "4hm": { category: "bosses", label: "Boss Icons" },
    twins: { category: "bosses", label: "Boss Icons" },
    gruul: { category: "bosses", label: "Boss Icons" },
    mag: { category: "bosses", label: "Boss Icons" },
    vashj: { category: "bosses", label: "Boss Icons" },
    kael: { category: "bosses", label: "Boss Icons" },
    illidan: { category: "bosses", label: "Boss Icons" },
    archi: { category: "bosses", label: "Boss Icons" },
    kj: { category: "bosses", label: "Boss Icons" },
    // Faction Icons
    alliance: { category: "faction", label: "Faction" },
    horde: { category: "faction", label: "Faction" },
    // Charge Icons
    "+": { category: "charge", label: "Charge" },
    positive: { category: "charge", label: "Charge" },
    "-": { category: "charge", label: "Charge" },
    negative: { category: "charge", label: "Charge" },
  };

// Display names for short abbreviation tags
const TAG_DISPLAY_NAMES: Record<string, string> = {
  // Raid markers
  rt1: "Star (alias)",
  rt2: "Circle (alias)",
  rt3: "Diamond (alias)",
  rt4: "Triangle (alias)",
  rt5: "Moon (alias)",
  rt6: "Square (alias)",
  rt7: "Cross (alias)",
  rt8: "Skull (alias)",
  x: "Cross (alias)",
  // Roles
  damage: "DPS (alias)",
  // Abilities
  bl: "Bloodlust",
  hero: "Heroism",
  heroism: "Heroism",
  bloodlust: "Bloodlust",
  hs: "Healthstone",
  healthstone: "Healthstone",
  // Warrior
  sunder: "Sunder Armor",
  aoe: "Challenging Shout",
  shout: "Challenging Shout",
  mock: "Mocking Blow",
  pummel: "Pummel",
  taunt: "Taunt",
  demo: "Demo Shout",
  thunder: "Thunder Clap",
  sw: "Shield Wall",
  ls: "Last Stand",
  reflect: "Spell Reflection",
  // Priest
  mc: "Mind Control",
  pi: "Power Infusion",
  fw: "Fear Ward",
  shackle: "Shackle Undead",
  dispel: "Dispel Magic",
  "pw:s": "PW: Shield",
  renew: "Renew",
  fort: "Fortitude",
  spirit: "Divine Spirit",
  shadow: "Shadow Prot",
  fade: "Fade",
  mds: "Mass Dispel",
  // Druid
  ff: "Faerie Fire",
  innerv: "Innervate",
  innervate: "Innervate",
  br: "Rebirth",
  rebirth: "Rebirth",
  remove: "Remove Curse",
  rejuv: "Rejuvenation",
  abolish: "Abolish Poison",
  gotw: "Gift of the Wild",
  thorns: "Thorns",
  bark: "Barkskin",
  barkskin: "Barkskin",
  // Paladin
  jol: "Judgement of Light",
  jow: "Judgement of Wisdom",
  joj: "Judgement of Justice",
  bop: "Blessing of Prot",
  bof: "Blessing of Freedom",
  di: "Divine Intervention",
  ds: "Divine Shield",
  sac: "Blessing of Sacrifice",
  cleanse: "Cleanse",
  loh: "Lay on Hands",
  bok: "Blessing of Kings",
  bow: "Blessing of Wisdom",
  bol: "Blessing of Light",
  salv: "Blessing of Salv",
  sanc: "Blessing of Sanc",
  // Mage
  cs: "Counterspell",
  counterspell: "Counterspell",
  sheep: "Polymorph",
  polymorph: "Polymorph",
  pig: "Polymorph: Pig",
  turtle: "Polymorph: Turtle",
  decurse: "Remove Curse",
  ai: "Arcane Intellect",
  dampen: "Dampen Magic",
  amplify: "Amplify Magic",
  block: "Ice Block",
  // Warlock
  coe: "Curse of Elements",
  cos: "Curse of Shadow",
  cor: "Curse of Reckless",
  ss: "Soulstone",
  soulstone: "Soulstone",
  banish: "Banish",
  seed: "Seed of Corruption",
  // Hunter
  tranq: "Tranq Shot",
  mark: "Hunter's Mark",
  md: "Misdirection",
  misdirection: "Misdirection",
  trap: "Freezing Trap",
  // Shaman
  es: "Earth Shock",
  wf: "Windfury Totem",
  tremor: "Tremor Totem",
  // Rogue
  kick: "Kick",
  feint: "Feint",
  cloak: "Cloak of Shadows",
  blind: "Blind",
  cheap: "Cheap Shot",
  kidney: "Kidney Shot",
  // Consumables
  lip: "LIP",
  stone: "Stoneshield",
  fap: "FAP",
  petri: "Petrification",
  "holy water": "Holy Water",
  // Boss Icons
  rag: "Ragnaros",
  nef: "Nefarian",
  ony: "Onyxia",
  hakkar: "Hakkar",
  cthun: "C'Thun",
  kt: "Kel'Thuzad",
  sapph: "Sapphiron",
  patch: "Patchwerk",
  "4hm": "Four Horsemen",
  twins: "Twin Emperors",
  gruul: "Gruul",
  mag: "Magtheridon",
  vashj: "Lady Vashj",
  kael: "Kael'thas",
  illidan: "Illidan",
  archi: "Archimonde",
  kj: "Kil'jaeden",
  // Faction
  alliance: "Alliance",
  horde: "Horde",
  // Charge
  "+": "Positive",
  positive: "Positive",
  "-": "Negative",
  negative: "Negative",
  // Arrows
  left: "Left Arrow",
  right: "Right Arrow",
  up: "Up Arrow",
  down: "Down Arrow",
  // Classes
  dk: "Death Knight",
  deathknight: "Death Knight",
  dh: "Demon Hunter",
  demonhunter: "Demon Hunter",
  monk: "Monk",
  evoker: "Evoker",
};

// Only include short abbreviation tags (skip long-form aliases like "sunder armor")
function isShortTag(tag: string): boolean {
  return !tag.includes(" ") || tag === "pw:s" || tag === "holy water";
}

let cachedRegistry: AATagCategory[] | null = null;

export function getAATagRegistry(): AATagCategory[] {
  if (cachedRegistry) return cachedRegistry;

  const categories: AATagCategory[] = [];

  // 0. Drag/Drop Assignment Slots
  categories.push({
    key: "assignments",
    label: "Assignment Slots",
    entries: [
      {
        tag: "assign:SlotName",
        displayName: "Assignment Slot",
        category: "special",
        iconType: "marker" as const,
        iconName: "",
      },
      {
        tag: "ref:SlotName",
        displayName: "Reference Slot",
        category: "special",
        iconType: "marker" as const,
        iconName: "",
      },
    ],
  });

  // 1. Raid Markers
  categories.push({
    key: "markers",
    label: "Raid Markers",
    entries: [
      ...AA_RAID_MARKERS.filter((m) => m !== "x").map((m) => ({
        tag: m,
        displayName: m.charAt(0).toUpperCase() + m.slice(1),
        category: "markers",
        iconType: "marker" as const,
        iconName: m,
      })),
      ...Object.entries(RAID_MARKER_ALIASES).map(([tag, name]) => ({
        tag,
        displayName: `${(name as string).charAt(0).toUpperCase() + (name as string).slice(1)} (alias)`,
        category: "markers",
        iconType: "marker" as const,
        iconName: name as string,
      })),
    ],
  });

  // 2. Roles
  categories.push({
    key: "roles",
    label: "Roles",
    entries: AA_ROLE_ICONS.filter((r) => r !== "damage").map((r) => ({
      tag: r,
      displayName: r.charAt(0).toUpperCase() + r.slice(1),
      category: "roles",
      iconType: "role" as const,
      iconName: r,
    })),
  });

  // 3. Classes
  categories.push({
    key: "classes",
    label: "Classes",
    entries: [
      ...AA_CLASS_ICONS.map((c) => ({
        tag: c,
        displayName: c.charAt(0).toUpperCase() + c.slice(1),
        category: "classes",
        iconType: "class" as const,
        iconName: c,
      })),
      // DK via texture
      {
        tag: "dk",
        displayName: "Death Knight",
        category: "classes",
        iconType: "texture" as const,
        iconName: AA_TEXTURE_TAGS["dk"]!,
      },
    ],
  });

  // 4. Abilities (local SVG)
  categories.push({
    key: "abilities",
    label: "Abilities",
    entries: (["bl", "hs"] as const).map((a) => ({
      tag: a,
      displayName: TAG_DISPLAY_NAMES[a] ?? a,
      category: "abilities",
      iconType: "ability" as const,
      iconName: a === "bl" ? "bloodlust" : "healthstone",
    })),
  });

  // 5. Arrows
  categories.push({
    key: "arrows",
    label: "Arrows",
    entries: Object.keys(AA_ARROW_ICONS).map((a) => ({
      tag: a,
      displayName: TAG_DISPLAY_NAMES[a] ?? a,
      category: "arrows",
      iconType: "arrow" as const,
      iconName: a,
    })),
  });

  // 6-14. Class-specific texture tags and other groups
  const groupOrder = [
    "warrior",
    "priest",
    "druid",
    "paladin",
    "mage",
    "warlock",
    "hunter",
    "shaman",
    "rogue",
    "consumables",
    "bosses",
    "faction",
    "charge",
  ];

  const groupedTextures: Record<string, AATagEntry[]> = {};

  for (const [tag, textureName] of Object.entries(AA_TEXTURE_TAGS)) {
    if (TEXTURE_SKIP_TAGS.has(tag)) continue;
    if (!isShortTag(tag)) continue;

    const catInfo = TEXTURE_CATEGORIES[tag];
    if (!catInfo) continue;

    const group = catInfo.category;
    if (!groupedTextures[group]) groupedTextures[group] = [];
    groupedTextures[group].push({
      tag,
      displayName: TAG_DISPLAY_NAMES[tag] ?? tag,
      category: group,
      iconType: "texture",
      iconName: textureName,
    });
  }

  const groupLabels: Record<string, string> = {
    warrior: "Warrior",
    priest: "Priest",
    druid: "Druid",
    paladin: "Paladin",
    mage: "Mage",
    warlock: "Warlock",
    hunter: "Hunter",
    shaman: "Shaman",
    rogue: "Rogue",
    consumables: "Consumables",
    bosses: "Boss Icons",
    faction: "Faction",
    charge: "Charge",
  };

  for (const group of groupOrder) {
    const entries = groupedTextures[group];
    if (entries && entries.length > 0) {
      categories.push({
        key: group,
        label: groupLabels[group] ?? group,
        entries,
      });
    }
  }

  // 15. Colors
  categories.push({
    key: "colors",
    label: "Colors",
    entries: [
      ...Object.keys(AA_COLORS).map((c) => ({
        tag: c,
        displayName: c.charAt(0).toUpperCase() + c.slice(1),
        category: "colors",
        iconType: "color" as const,
        iconName: AA_COLORS[c]!,
      })),
      ...Object.keys(AA_CLASS_COLORS).map((c) => ({
        tag: c,
        displayName: c.charAt(0).toUpperCase() + c.slice(1),
        category: "colors",
        iconType: "color" as const,
        iconName: AA_CLASS_COLORS[c]!,
      })),
    ],
  });

  // 16. Special Syntax
  categories.push({
    key: "special",
    label: "Special Syntax",
    entries: [
      {
        tag: "icon 12345",
        displayName: "Spell Icon (by ID)",
        category: "special",
        iconType: "spell" as const,
        iconName: "0",
      },
      {
        tag: "icon texturename",
        displayName: "Texture Icon",
        category: "special",
        iconType: "texture" as const,
        iconName: "spell_holy_powerinfusion",
      },
      {
        tag: "r",
        displayName: "Color Reset",
        category: "special",
        iconType: "color" as const,
        iconName: "#ffffff",
      },
    ],
  });

  cachedRegistry = categories;
  return categories;
}

/** Flat list of all tag entries for autocomplete filtering */
export function getAATagFlat(): AATagEntry[] {
  return getAATagRegistry().flatMap((c) => c.entries);
}
