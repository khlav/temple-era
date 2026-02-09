/**
 * AngryAssignments Formatting Parser
 *
 * Parses AA color codes and icon tags into renderable segments.
 * Supports colors (|cclass, |cname, |cffRRGGBB), markers ({skull}, {star}),
 * roles ({tank}, {healer}, {dps}), classes ({warrior}, {mage}), and abilities ({bl}, {hs}).
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

// Role names
export const AA_ROLE_ICONS = ["tank", "healer", "dps", "damage"] as const;

// Ability names
export const AA_ABILITY_ICONS = [
  "bl",
  "bloodlust",
  "hero",
  "heroism",
  "hs",
  "healthstone",
] as const;

// Class names for icons
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
  "dk",
  "deathknight",
] as const;

// All known color/class names sorted by length descending for prefix matching.
// This ensures e.g. "deathknight" matches before "death" and "warrior" matches
// before consuming trailing text like "|cwarriorReck|r" → color "warrior", text "Reck".
const KNOWN_COLOR_NAMES = [
  ...Object.keys(AA_CLASS_COLORS),
  ...Object.keys(AA_COLORS),
].sort((a, b) => b.length - a.length);

export type AAIconType = "marker" | "role" | "class" | "ability" | "spell";

export interface AASegment {
  type: "text" | "colored-text" | "icon" | "slot" | "ref";
  content: string;
  color?: string;
  iconType?: AAIconType;
  iconName?: string;
  slotDef?: AASlotDefinition;
  refDef?: AARefDefinition;
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

  // Check roles
  if ((AA_ROLE_ICONS as readonly string[]).includes(lower)) {
    // Normalize 'damage' to 'dps'
    const name = lower === "damage" ? "dps" : lower;
    return { type: "role", name };
  }

  // Check abilities
  if ((AA_ABILITY_ICONS as readonly string[]).includes(lower)) {
    // Normalize ability names
    let name = lower;
    if (lower === "bloodlust" || lower === "bl") name = "bloodlust";
    if (lower === "heroism" || lower === "hero") name = "bloodlust"; // Same icon
    if (lower === "healthstone" || lower === "hs") name = "healthstone";
    return { type: "ability", name };
  }

  // Check classes
  if ((AA_CLASS_ICONS as readonly string[]).includes(lower)) {
    // Normalize 'dk' to 'deathknight'
    const name = lower === "dk" ? "deathknight" : lower;
    return { type: "class", name };
  }

  return null;
}

/**
 * Parse an AA template into renderable segments.
 *
 * Handles:
 * - Color codes: |cred, |cmage, |cffAABBCC followed by text until |r
 * - Icon tags: {star}, {tank}, {mage}, {bl}
 * - Slot tags: {assign:SlotName} (converted to slot segments)
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

  // Regex patterns
  // Color code: |c followed by class/color name or hex (8 chars)
  // Icon tag: {tagname} where tagname is a known icon
  // Reset: |r

  let i = 0;
  let currentColor: string | null = null;
  let textBuffer = "";

  const flushText = () => {
    if (textBuffer) {
      if (currentColor) {
        segments.push({
          type: "colored-text",
          content: textBuffer,
          color: currentColor,
        });
      } else {
        segments.push({ type: "text", content: textBuffer });
      }
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
        textBuffer += template[i];
        i++;
      }
      continue;
    }

    // Check for color reset |r
    if (template[i] === "|" && template[i + 1]?.toLowerCase() === "r") {
      flushText();
      currentColor = null;
      i += 2;
      continue;
    }

    // Line breaks reset color
    if (template[i] === "\n") {
      textBuffer += template[i];
      flushText();
      currentColor = null;
      i++;
      continue;
    }

    // Check for icon tag {tagname} or {icon NUMBER}
    if (template[i] === "{") {
      const closeIndex = template.indexOf("}", i);
      if (closeIndex !== -1) {
        const tagContent = template.slice(i + 1, closeIndex);

        // Skip assign slots and ref tags (handled above)
        if (
          tagContent.toLowerCase().startsWith("assign:") ||
          tagContent.toLowerCase().startsWith("ref:")
        ) {
          textBuffer += template[i];
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
          continue;
        }
      }
    }

    // Regular character
    textBuffer += template[i];
    i++;
  }

  // Flush any remaining text
  flushText();

  return segments;
}
