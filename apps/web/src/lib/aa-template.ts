/**
 * AngryAssignments Template Parser & Renderer
 *
 * Parses templates with {assign:SlotName} slots and renders them with character assignments.
 *
 * Slot syntax:
 *   {assign:SlotName}              - Basic slot, class-colored names (default)
 *   {assign:SlotName:nocolor}      - Slot without class coloring
 *   {assign:SlotName:4}            - Max 4 characters
 *   {assign:SlotName:4:nocolor}    - Both limit and no color
 *
 * All other AA codes (|cclass, {marker}, {role}, etc.) are passed through unchanged.
 */

export interface AASlotDefinition {
  name: string;
  maxCharacters?: number;
  noColor?: boolean;
  startIndex: number;
  endIndex: number;
  rawMatch: string;
}

export interface AARefDefinition {
  name: string;
  noColor?: boolean;
  startIndex: number;
  endIndex: number;
  rawMatch: string;
}

export interface AACharacterAssignment {
  name: string;
  class: string | null;
}

export interface ParseResult {
  slots: AASlotDefinition[];
  refs: AARefDefinition[];
  errors: string[];
}

// WoW class color codes for AngryAssignments
const CLASS_COLOR_CODES: Record<string, string> = {
  warrior: "|cwarrior",
  paladin: "|cpaladin",
  hunter: "|chunter",
  rogue: "|crogue",
  priest: "|cpriest",
  shaman: "|cshaman",
  mage: "|cmage",
  warlock: "|cwarlock",
  druid: "|cdruid",
  "death knight": "|cdeathknight",
  deathknight: "|cdeathknight",
};

// Regex to match {assign:SlotName} with optional modifiers
// Captures: slotName, optional number, optional "nocolor"
const ASSIGN_SLOT_REGEX = /\{assign:([^\s:}]+)(?::(\d+))?(?::(nocolor))?\}/gi;

// Regex to match {ref:SlotName} with optional nocolor modifier
const REF_SLOT_REGEX = /\{ref:([^\s:}]+)(?::(nocolor))?\}/gi;

/**
 * Parse an AA template to extract slot definitions.
 * Returns slots and any validation errors (e.g., duplicate slot names).
 */
export function parseAATemplate(template: string): ParseResult {
  const slots: AASlotDefinition[] = [];
  const refs: AARefDefinition[] = [];
  const slotNames = new Set<string>();
  const errors: string[] = [];

  // Reset regex lastIndex for global matching
  ASSIGN_SLOT_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ASSIGN_SLOT_REGEX.exec(template)) !== null) {
    const [rawMatch, slotName, maxCharsStr, noColorFlag] = match;
    const normalizedName = slotName!.trim();

    // Check for duplicate slot names
    if (slotNames.has(normalizedName.toLowerCase())) {
      errors.push(`Duplicate slot name: "${normalizedName}"`);
    }
    slotNames.add(normalizedName.toLowerCase());

    const slot: AASlotDefinition = {
      name: normalizedName,
      startIndex: match.index,
      endIndex: match.index + rawMatch!.length,
      rawMatch: rawMatch!,
    };

    if (maxCharsStr) {
      slot.maxCharacters = parseInt(maxCharsStr, 10);
    }

    if (noColorFlag) {
      slot.noColor = true;
    }

    slots.push(slot);
  }

  // Parse ref tags
  REF_SLOT_REGEX.lastIndex = 0;

  while ((match = REF_SLOT_REGEX.exec(template)) !== null) {
    const [rawMatch, refName, noColorFlag] = match;
    const normalizedName = refName!.trim();

    const ref: AARefDefinition = {
      name: normalizedName,
      startIndex: match.index,
      endIndex: match.index + rawMatch!.length,
      rawMatch: rawMatch!,
    };

    if (noColorFlag) {
      ref.noColor = true;
    }

    // Validate: ref must reference an existing slot name
    if (!slotNames.has(normalizedName.toLowerCase())) {
      errors.push(`Ref "${normalizedName}" does not match any slot`);
    }

    refs.push(ref);
  }

  return { slots, refs, errors };
}

/**
 * Validate a template for slot name errors.
 * Returns an array of error messages (empty if valid).
 */
export function validateSlotNames(template: string): string[] {
  const { errors } = parseAATemplate(template);
  return errors;
}

/**
 * Get the class color code for a character class.
 * Returns the color code or empty string if class not found.
 */
function getClassColorCode(className: string | null): string {
  if (!className) return "";
  const normalized = className.toLowerCase().replace(/\s+/g, "");
  return CLASS_COLOR_CODES[normalized] ?? "";
}

/**
 * Format a character name with optional class coloring for AA output.
 */
function formatCharacterName(
  character: AACharacterAssignment,
  useColor: boolean,
): string {
  if (!useColor) {
    return character.name;
  }

  const colorCode = getClassColorCode(character.class);
  if (colorCode) {
    // Add color code before name and reset after
    return `${colorCode}${character.name}|r`;
  }

  return character.name;
}

/**
 * Render an AA template with character assignments.
 * Replaces {assign:SlotName} placeholders with assigned character names.
 *
 * @param template - The raw AA template with {assign:X} slots
 * @param slotAssignments - Map of slot name -> array of assigned characters
 * @returns The rendered template ready for WoW import
 */
export function renderAATemplate(
  template: string,
  slotAssignments: Map<string, AACharacterAssignment[]>,
): string {
  const { slots, refs } = parseAATemplate(template);

  // Build a lookup of slot noColor by name (case-insensitive)
  const slotNoColorMap = new Map<string, boolean>();
  for (const slot of slots) {
    slotNoColorMap.set(slot.name.toLowerCase(), !!slot.noColor);
  }

  // Collect all replaceable positions (slots + refs), sort descending by startIndex
  const replacements: {
    startIndex: number;
    endIndex: number;
    name: string;
    noColor?: boolean;
    maxCharacters?: number;
  }[] = [
    ...slots.map((s) => ({
      startIndex: s.startIndex,
      endIndex: s.endIndex,
      name: s.name,
      noColor: s.noColor,
      maxCharacters: s.maxCharacters,
    })),
    ...refs.map((r) => ({
      startIndex: r.startIndex,
      endIndex: r.endIndex,
      name: r.name,
      // Ref uses its own noColor if set, otherwise inherits from the referenced slot
      noColor:
        r.noColor !== undefined
          ? r.noColor
          : slotNoColorMap.get(r.name.toLowerCase()),
      maxCharacters: undefined,
    })),
  ].sort((a, b) => b.startIndex - a.startIndex);

  let result = template;

  for (const item of replacements) {
    const assignments = slotAssignments.get(item.name) ?? [];
    const useColor = !item.noColor;

    // Format character names
    const names = assignments.map((char) =>
      formatCharacterName(char, useColor),
    );

    // Truncate to max characters if specified
    const limitedNames = item.maxCharacters
      ? names.slice(0, item.maxCharacters)
      : names;

    // Join with space (common AA convention)
    const replacement = limitedNames.join(" ");

    // Replace the placeholder with the names
    result =
      result.slice(0, item.startIndex) +
      replacement +
      result.slice(item.endIndex);
  }

  return result;
}

/**
 * Extract unique slot names from a template.
 * Useful for UI to show available slots.
 */
export function getSlotNames(template: string): string[] {
  const { slots } = parseAATemplate(template);
  const seen = new Set<string>();
  const names: string[] = [];

  for (const slot of slots) {
    const lower = slot.name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      names.push(slot.name);
    }
  }

  return names;
}

/**
 * Get slot definitions with their metadata.
 * Returns the first occurrence of each slot (deduplicated by name).
 */
export function getSlotDefinitions(template: string): AASlotDefinition[] {
  const { slots } = parseAATemplate(template);
  const seen = new Set<string>();
  const definitions: AASlotDefinition[] = [];

  for (const slot of slots) {
    const lower = slot.name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      definitions.push(slot);
    }
  }

  return definitions;
}
