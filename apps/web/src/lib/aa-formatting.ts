/**
 * AngryAssignments Formatting Parser
 *
 * Parses AA color codes, icon tags, and markdown formatting into renderable segments.
 * Supports colors (|cclass, |cname, |cffRRGGBB), markers ({skull}, {star}, {rt1}-{rt8}),
 * roles ({tank}, {healer}, {dps}), classes ({warrior}, {mage}), abilities ({bl}, {hs}),
 * raid utility spells ({sunder}, {pi}, {tranq}), boss icons ({rag}, {kt}),
 * directional icons ({left}, {right}, {+}, {-}), faction icons ({alliance}, {horde}),
 * consumables ({lip}, {fap}), {icon NUMBER} spell icons, {icon TEXTURENAME} texture icons,
 * and markdown formatting (## headers, **bold**, _italic_, - lists).
 */

import type { AASlotDefinition, AARefDefinition } from "./aa-template";

// Named colors (from AngryEra/Core.lua ColorTable)
export const AA_COLORS: Record<string, string> = {
  blue: "#00cbf4",
  green: "#0adc00",
  red: "#eb310c",
  yellow: "#faf318",
  orange: "#ff9d00",
  pink: "#f64c97",
  purple: "#dc44eb",
  white: "#ffffff",
};

// Class colors (WoW class colors)
export const AA_CLASS_COLORS: Record<string, string> = {
  druid: "#ff7d0a",
  hunter: "#abd473",
  mage: "#40c7eb",
  paladin: "#f58cba",
  priest: "#ffffff",
  rogue: "#fff569",
  shaman: "#0070de",
  warlock: "#8787ed",
  warrior: "#c79c6e",
  dk: "#c41f3b",
  deathknight: "#c41f3b",
  dh: "#a330c9",
  demonhunter: "#a330c9",
  monk: "#00ff96",
  evoker: "#33937f",
};

// Raid marker names
export const AA_RAID_MARKERS = [
  "star",
  "circle",
  "diamond",
  "triangle",
  "moon",
  "square",
  "cross",
  "x",
  "skull",
] as const;

// Raid marker aliases ({rt1} through {rt8})
export const RAID_MARKER_ALIASES: Record<string, string> = {
  rt1: "star",
  rt2: "circle",
  rt3: "diamond",
  rt4: "triangle",
  rt5: "moon",
  rt6: "square",
  rt7: "cross",
  rt8: "skull",
};

// Role names
export const AA_ROLE_ICONS = ["tank", "healer", "dps", "damage"] as const;

// Ability names (rendered from local SVGs)
export const AA_ABILITY_ICONS = [
  "bl",
  "bloodlust",
  "hero",
  "heroism",
  "hs",
  "healthstone",
] as const;

// Class names for icons (rendered from local PNGs via ClassIcon)
// Note: dk/deathknight excluded here - no local PNG exists, routed via AA_TEXTURE_TAGS instead
export const AA_CLASS_ICONS = [
  "warrior",
  "paladin",
  "hunter",
  "rogue",
  "priest",
  "shaman",
  "mage",
  "warlock",
  "druid",
] as const;

// Comprehensive texture tag lookup
// Maps lowercase tag content to Wowhead icon texture name.
// These render as <img> from the Wowhead CDN: wow.zamimg.com/images/wow/icons/medium/{texture}.jpg
export const AA_TEXTURE_TAGS: Record<string, string> = {
  // --- Warrior ---
  sunder: "ability_warrior_sunder",
  "sunder armor": "ability_warrior_sunder",
  aoe: "ability_bullrush",
  "challenging shout": "ability_bullrush",
  shout: "ability_bullrush",
  mock: "ability_kick",
  "mocking blow": "ability_kick",
  pummel: "inv_gauntlets_04",
  taunt: "spell_nature_reincarnation",
  demo: "ability_warrior_waracry",
  "demoralizing shout": "ability_warrior_waracry",
  thunder: "spell_nature_thunderclap",
  "thunder clap": "spell_nature_thunderclap",
  sw: "ability_warrior_shieldwall",
  "shield wall": "ability_warrior_shieldwall",
  ls: "spell_holy_ashestoashes",
  "last stand": "spell_holy_ashestoashes",
  reflect: "ability_warrior_shieldreflection",
  "spell reflection": "ability_warrior_shieldreflection",

  // --- Priest ---
  mc: "spell_shadow_shadowworddominate",
  "mind control": "spell_shadow_shadowworddominate",
  pi: "spell_holy_powerinfusion",
  "power infusion": "spell_holy_powerinfusion",
  fw: "spell_holy_excorcism",
  "fear ward": "spell_holy_excorcism",
  shackle: "spell_nature_slow",
  "shackle undead": "spell_nature_slow",
  dispel: "spell_holy_dispelmagic",
  dispell: "spell_holy_dispelmagic",
  "dispel magic": "spell_holy_dispelmagic",
  "pw:s": "spell_holy_powerwordshield",
  "power word: shield": "spell_holy_powerwordshield",
  renew: "spell_holy_renew",
  fort: "spell_holy_wordfortitude",
  "power word: fortitude": "spell_holy_wordfortitude",
  spirit: "spell_holy_divinespirit",
  "divine spirit": "spell_holy_divinespirit",
  shadow: "spell_shadow_antishadow",
  "shadow protection": "spell_shadow_antishadow",
  fade: "spell_magic_lesserinvisibilty",
  mds: "spell_arcane_massdispel",
  "mass dispel": "spell_arcane_massdispel",

  // --- Druid ---
  ff: "spell_nature_faeriefire",
  "faerie fire": "spell_nature_faeriefire",
  innerv: "spell_nature_lightning",
  innervate: "spell_nature_lightning",
  br: "spell_nature_reincarnation",
  rebirth: "spell_nature_reincarnation",
  remove: "spell_nature_removecurse",
  "remove curse": "spell_nature_removecurse",
  rejuv: "spell_nature_rejuvenation",
  rejuvenation: "spell_nature_rejuvenation",
  abolish: "spell_nature_nullifypoison_02",
  "abolish poison": "spell_nature_nullifypoison_02",
  gotw: "spell_nature_regeneration",
  "gift of the wild": "spell_nature_regeneration",
  thorns: "spell_nature_thorns",
  bark: "spell_nature_stoneclawtotem",
  barkskin: "spell_nature_stoneclawtotem",

  // --- Paladin ---
  jol: "spell_holy_healingaura",
  "judgement of light": "spell_holy_healingaura",
  jow: "spell_holy_righteousnessaura",
  "judgement of wisdom": "spell_holy_righteousnessaura",
  joj: "spell_holy_sealofwrath",
  "judgement of justice": "spell_holy_sealofwrath",
  bop: "spell_holy_sealofprotection",
  "blessing of protection": "spell_holy_sealofprotection",
  bof: "spell_holy_sealofvalor",
  "blessing of freedom": "spell_holy_sealofvalor",
  di: "spell_nature_timestop",
  "divine intervention": "spell_nature_timestop",
  ds: "spell_holy_divineshield",
  "divine shield": "spell_holy_divineshield",
  sac: "spell_holy_sealofsacrifice",
  "blessing of sacrifice": "spell_holy_sealofsacrifice",
  cleanse: "spell_holy_renew",
  loh: "spell_holy_layonhands",
  "lay on hands": "spell_holy_layonhands",
  bok: "spell_magic_greaterblessingofkings",
  "greater blessing of kings": "spell_magic_greaterblessingofkings",
  bow: "spell_holy_greaterblessingofwisdom",
  "greater blessing of wisdom": "spell_holy_greaterblessingofwisdom",
  bol: "spell_holy_greaterblessingoflight",
  "greater blessing of light": "spell_holy_greaterblessingoflight",
  salv: "spell_holy_greaterblessingofsalvation",
  "greater blessing of salvation": "spell_holy_greaterblessingofsalvation",
  sanc: "spell_holy_greaterblessingofsanctuary",
  "greater blessing of sanctuary": "spell_holy_greaterblessingofsanctuary",

  // --- Mage ---
  cs: "spell_frost_iceshock",
  counterspell: "spell_frost_iceshock",
  sheep: "spell_nature_polymorph",
  polymorph: "spell_nature_polymorph",
  pig: "spell_magic_polymorphpig",
  "polymorph: pig": "spell_magic_polymorphpig",
  turtle: "ability_hunter_pet_turtle",
  "polymorph: turtle": "ability_hunter_pet_turtle",
  decurse: "spell_nature_removecurse",
  "remove lesser curse": "spell_nature_removecurse",
  ai: "spell_holy_magicalsentry",
  "arcane intellect": "spell_holy_magicalsentry",
  dampen: "spell_nature_abolishmagic",
  "dampen magic": "spell_nature_abolishmagic",
  amplify: "spell_nature_abolishmagic",
  "amplify magic": "spell_nature_abolishmagic",
  block: "spell_frost_frost",
  "ice block": "spell_frost_frost",

  // --- Warlock ---
  coe: "spell_shadow_chilltouch",
  "curse of elements": "spell_shadow_chilltouch",
  cos: "spell_shadow_curseofachimonde",
  "curse of shadow": "spell_shadow_curseofachimonde",
  cor: "spell_shadow_unholystrength",
  "curse of recklessness": "spell_shadow_unholystrength",
  ss: "spell_shadow_soulgem",
  soulstone: "spell_shadow_soulgem",
  banish: "spell_shadow_cripple",
  seed: "spell_shadow_seedofdestruction",
  "seed of corruption": "spell_shadow_seedofdestruction",

  // --- Hunter ---
  tranq: "spell_nature_drowsy",
  "tranquilizing shot": "spell_nature_drowsy",
  mark: "ability_hunter_snipershot",
  "hunter's mark": "ability_hunter_snipershot",
  md: "ability_hunter_misdirection",
  misdirection: "ability_hunter_misdirection",
  trap: "spell_frost_chainsofice",
  "freezing trap": "spell_frost_chainsofice",

  // --- Shaman ---
  es: "spell_nature_earthshock",
  "earth shock": "spell_nature_earthshock",
  wf: "spell_nature_windfury",
  "windfury totem": "spell_nature_windfury",
  tremor: "spell_nature_tremortotem",
  "tremor totem": "spell_nature_tremortotem",

  // --- Rogue ---
  kick: "ability_kick",
  feint: "ability_rogue_feint",
  cloak: "spell_shadow_nethercloak",
  "cloak of shadows": "spell_shadow_nethercloak",
  blind: "spell_shadow_mindsteal",
  cheap: "ability_cheapshot",
  "cheap shot": "ability_cheapshot",
  kidney: "ability_rogue_kidneyshot",
  "kidney shot": "ability_rogue_kidneyshot",

  // --- Consumables ---
  lip: "inv_potion_62",
  "limited invulnerability potion": "inv_potion_62",
  stone: "inv_potion_69",
  "greater stoneshield potion": "inv_potion_69",
  fap: "inv_potion_04",
  "free action potion": "inv_potion_04",
  petri: "inv_potion_26",
  "flask of petrification": "inv_potion_26",
  "holy water": "inv_potion_75",
  "stratholme holy water": "inv_potion_75",

  // --- Boss Icons ---
  rag: "inv_hammer_unique_sulfuras",
  nef: "inv_misc_head_dragon_black",
  ony: "inv_misc_head_dragon_01",
  hakkar: "inv_misc_head_dragon_green",
  cthun: "inv_misc_eye_01",
  kt: "inv_trinket_naxxramas06",
  sapph: "inv_misc_head_dragon_blue",
  patch: "inv_misc_monsterhead_04",
  "4hm": "inv_helmet_09",
  twins: "inv_qirajidol_obsidian",
  gruul: "achievement_boss_gruul",
  mag: "inv_misc_monsterhead_03",
  vashj: "achievement_boss_ladyvashj",
  kael: "spell_fire_burnout",
  illidan: "inv_weapon_glave_01",
  archi: "spell_shadow_deathcoil",
  kj: "achievement_boss_kiljaedan",

  // --- Faction Icons ---
  alliance: "inv_bannerpvp_02",
  horde: "inv_bannerpvp_01",

  // --- Charge Icons ---
  "+": "spell_chargepositive",
  positive: "spell_chargepositive",
  "-": "spell_chargenegative",
  negative: "spell_chargenegative",

  // --- Class Icons (rendered via CDN since no local PNG) ---
  dk: "classicon_deathknight",
  deathknight: "classicon_deathknight",
  dh: "classicon_demonhunter",
  demonhunter: "classicon_demonhunter",
  monk: "classicon_monk",
  evoker: "classicon_evoker",
};

// Directional arrow icons (rendered as colored unicode text)
export const AA_ARROW_ICONS: Record<string, string> = {
  left: "\u25C4",
  right: "\u25BA",
  up: "\u25B2",
  down: "\u25BC",
};

// All known color/class names sorted by length descending for prefix matching.
// This ensures e.g. "deathknight" matches before "death" and "warrior" matches
// before consuming trailing text like "|cwarriorReck|r" -> color "warrior", text "Reck".
const KNOWN_COLOR_NAMES = [
  ...Object.keys(AA_CLASS_COLORS),
  ...Object.keys(AA_COLORS),
].sort((a, b) => b.length - a.length);

export type AAIconType =
  | "marker"
  | "role"
  | "class"
  | "ability"
  | "spell"
  | "texture"
  | "color";

export interface AASegment {
  type: "text" | "colored-text" | "icon" | "slot" | "ref";
  content: string;
  color?: string;
  iconType?: AAIconType;
  iconName?: string;
  slotDef?: AASlotDefinition;
  refDef?: AARefDefinition;
  fontStyle?: "italic";
  fontWeight?: "bold";
}

/**
 * Get color from a color code string.
 * Supports: |cred, |cmage, |cffRRGGBB
 */
function getColorFromCode(colorCode: string): string | null {
  const lower = colorCode.toLowerCase();

  // Check hex format: |cffRRGGBB
  if (lower.startsWith("ff") && lower.length === 8) {
    return `#${lower.slice(2)}`;
  }

  // Check class colors
  if (AA_CLASS_COLORS[lower]) {
    return AA_CLASS_COLORS[lower];
  }

  // Check named colors
  if (AA_COLORS[lower]) {
    return AA_COLORS[lower];
  }

  return null;
}

/**
 * Determine the icon type and normalized name from an icon tag.
 */
function getIconInfo(tag: string): { type: AAIconType; name: string } | null {
  const lower = tag.toLowerCase();

  // Check raid markers
  if ((AA_RAID_MARKERS as readonly string[]).includes(lower)) {
    // Normalize 'x' to 'cross'
    const name = lower === "x" ? "cross" : lower;
    return { type: "marker", name };
  }

  // Check raid marker aliases ({rt1} through {rt8})
  const markerAlias = RAID_MARKER_ALIASES[lower];
  if (markerAlias) {
    return { type: "marker", name: markerAlias };
  }

  // Check roles
  if ((AA_ROLE_ICONS as readonly string[]).includes(lower)) {
    // Normalize 'damage' to 'dps'
    const name = lower === "damage" ? "dps" : lower;
    return { type: "role", name };
  }

  // Check abilities (local SVG icons)
  if ((AA_ABILITY_ICONS as readonly string[]).includes(lower)) {
    // Normalize ability names
    let name = lower;
    if (lower === "bloodlust" || lower === "bl") name = "bloodlust";
    if (lower === "heroism" || lower === "hero") name = "bloodlust"; // Same icon
    if (lower === "healthstone" || lower === "hs") name = "healthstone";
    return { type: "ability", name };
  }

  // Check classes (local PNG icons via ClassIcon)
  if ((AA_CLASS_ICONS as readonly string[]).includes(lower)) {
    return { type: "class", name: lower };
  }

  // Check texture tags (Wowhead CDN icons)
  const texture = AA_TEXTURE_TAGS[lower];
  if (texture) {
    return { type: "texture", name: texture };
  }

  return null;
}

/**
 * Parse an AA template into renderable segments.
 *
 * Handles:
 * - Color codes: |cred, |cmage, |cffAABBCC followed by text until |r
 * - Icon tags: {star}, {tank}, {mage}, {bl}, {sunder}, {rag}, {left}
 * - Slot tags: {assign:SlotName} (converted to slot segments)
 * - Pipe normalization: || -> single |
 * - Texture icon tags: {icon texturename}
 * - Markdown: ## headers, **bold**, _italic_, - lists
 */
export function parseAAFormatting(
  template: string,
  slots: AASlotDefinition[],
  refs: AARefDefinition[] = [],
): AASegment[] {
  const segments: AASegment[] = [];

  // Create a map of slot positions for quick lookup
  const slotsByStart = new Map<number, AASlotDefinition>();
  for (const slot of slots) {
    slotsByStart.set(slot.startIndex, slot);
  }

  // Create a map of ref positions for quick lookup
  const refsByStart = new Map<number, AARefDefinition>();
  for (const ref of refs) {
    refsByStart.set(ref.startIndex, ref);
  }

  let i = 0;
  let currentColor: string | null = null;
  let textBuffer = "";

  // Markdown state
  let atLineStart = true;
  let markdownBold = false;
  let markdownItalic = false;
  let markdownHeader = false;

  const flushText = () => {
    if (textBuffer) {
      const content = markdownHeader ? textBuffer.toUpperCase() : textBuffer;
      const effectiveColor =
        currentColor ??
        (markdownHeader ? "#faf318" : null) ??
        (markdownBold ? "#ffffff" : null) ??
        (markdownItalic ? "#888888" : null);

      const segment: AASegment = {
        type: effectiveColor ? "colored-text" : "text",
        content,
      };
      if (effectiveColor) segment.color = effectiveColor;
      if (markdownItalic) segment.fontStyle = "italic";
      if (markdownBold) segment.fontWeight = "bold";

      segments.push(segment);
      textBuffer = "";
    }
  };

  while (i < template.length) {
    // Check if we're at a slot position
    const slot = slotsByStart.get(i);
    if (slot) {
      flushText();
      segments.push({
        type: "slot",
        content: slot.rawMatch,
        slotDef: slot,
      });
      i = slot.endIndex;
      atLineStart = false;
      continue;
    }

    // Check if we're at a ref position
    const ref = refsByStart.get(i);
    if (ref) {
      flushText();
      segments.push({
        type: "ref",
        content: ref.rawMatch,
        refDef: ref,
      });
      i = ref.endIndex;
      atLineStart = false;
      continue;
    }

    // --- Markdown: line-level features ---

    // Check for header: ## at start of line
    if (atLineStart && template[i] === "#") {
      let hashEnd = i;
      while (hashEnd < template.length && template[hashEnd] === "#") {
        hashEnd++;
      }
      if (hashEnd > i && template[hashEnd] === " ") {
        flushText();
        markdownHeader = true;
        // Set gold color as default (explicit |c codes will override)
        i = hashEnd + 1; // skip past "## "
        atLineStart = false;
        continue;
      }
    }

    // Check for list item: - at start of line
    if (atLineStart && template[i] === "-" && template[i + 1] === " ") {
      flushText();
      segments.push({
        type: "colored-text",
        content: "* ",
        color: "#faf318",
      });
      i += 2;
      atLineStart = false;
      continue;
    }

    // --- Markdown: inline features ---

    // Check for bold: **text**
    if (template[i] === "*" && template[i + 1] === "*") {
      flushText();
      markdownBold = !markdownBold;
      i += 2;
      atLineStart = false;
      continue;
    }

    // Check for italic: _text_
    // Only toggle if _ is at a word boundary (not inside texture names etc.)
    if (
      template[i] === "_" &&
      // Don't trigger inside braces (texture names like spell_holy_renew)
      !textBuffer.includes("{") &&
      // Check it looks like a markdown delimiter (preceded by space/start or followed by space/end)
      (i === 0 ||
        template[i - 1] === " " ||
        template[i - 1] === "\n" ||
        markdownItalic)
    ) {
      flushText();
      markdownItalic = !markdownItalic;
      i++;
      atLineStart = false;
      continue;
    }

    // --- Pipe handling ---

    // Pipe normalization: || -> single |
    if (template[i] === "|" && template[i + 1] === "|") {
      textBuffer += "|";
      i += 2;
      atLineStart = false;
      continue;
    }

    // Check for color code |c...
    if (template[i] === "|" && template[i + 1]?.toLowerCase() === "c") {
      flushText();

      // Find the end of the color code
      // Could be |cclassname or |cffRRGGBB (8 hex chars)
      let j = i + 2;

      // Check for hex format first (starts with ff)
      if (
        template.slice(j, j + 2).toLowerCase() === "ff" &&
        /^[0-9a-fA-F]{8}$/.test(template.slice(j, j + 8))
      ) {
        const hexCode = template.slice(j, j + 8);
        const color = getColorFromCode(hexCode);
        if (color) {
          currentColor = color;
          i = j + 8;
          atLineStart = false;
          continue;
        }
      }

      // Try to match a known color/class name as a prefix (longest first)
      const remaining = template.slice(j).toLowerCase();
      let matched = false;

      for (const name of KNOWN_COLOR_NAMES) {
        if (remaining.startsWith(name)) {
          const color = getColorFromCode(name);
          if (color) {
            currentColor = color;
            i = j + name.length;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        // Unknown color code, treat as text
        textBuffer += template[i]!;
        i++;
      }
      atLineStart = false;
      continue;
    }

    // Check for color reset |r
    if (template[i] === "|" && template[i + 1]?.toLowerCase() === "r") {
      flushText();
      currentColor = null;
      i += 2;
      atLineStart = false;
      continue;
    }

    // Line breaks reset color and markdown state
    if (template[i] === "\n") {
      textBuffer += template[i];
      flushText();
      currentColor = null;
      markdownHeader = false;
      // Bold and italic can span lines in some AA templates, but headers don't
      atLineStart = true;
      i++;
      continue;
    }

    // Check for icon tag {tagname} or {icon NUMBER} or {icon TEXTURENAME}
    if (template[i] === "{") {
      const closeIndex = template.indexOf("}", i);
      if (closeIndex !== -1) {
        const tagContent = template.slice(i + 1, closeIndex);

        // Skip assign slots and ref tags (handled above)
        if (
          tagContent.toLowerCase().startsWith("assign:") ||
          tagContent.toLowerCase().startsWith("ref:")
        ) {
          textBuffer += template[i]!;
          i++;
          continue;
        }

        // Check for {icon NUMBER} spell icon tags
        const iconMatch = tagContent.match(/^icon\s+(\d+)$/i);
        if (iconMatch) {
          const spellId = parseInt(iconMatch[1]!, 10);
          flushText();
          segments.push({
            type: "icon",
            content: `{${tagContent}}`,
            iconType: "spell",
            iconName: spellId.toString(),
          });
          i = closeIndex + 1;
          atLineStart = false;
          continue;
        }

        // Check for {icon TEXTURENAME} texture icon tags
        const textureIconMatch = tagContent.match(/^icon\s+(\S+)$/i);
        if (textureIconMatch) {
          flushText();
          segments.push({
            type: "icon",
            content: `{${tagContent}}`,
            iconType: "texture",
            iconName: textureIconMatch[1]!,
          });
          i = closeIndex + 1;
          atLineStart = false;
          continue;
        }

        // Check for directional arrow icons (rendered as colored text)
        const arrow = AA_ARROW_ICONS[tagContent.toLowerCase()];
        if (arrow) {
          flushText();
          segments.push({
            type: "colored-text",
            content: arrow,
            color: "#faf318",
          });
          i = closeIndex + 1;
          atLineStart = false;
          continue;
        }

        const iconInfo = getIconInfo(tagContent);
        if (iconInfo) {
          flushText();
          segments.push({
            type: "icon",
            content: `{${tagContent}}`,
            iconType: iconInfo.type,
            iconName: iconInfo.name,
          });
          i = closeIndex + 1;
          atLineStart = false;
          continue;
        }
      }
    }

    // Regular character
    textBuffer += template[i];
    if (template[i] !== " " && template[i] !== "\t") {
      atLineStart = false;
    }
    i++;
  }

  // Flush any remaining text
  flushText();

  return segments;
}
