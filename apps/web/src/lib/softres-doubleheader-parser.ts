import { type RaidZone } from "~/lib/raid-zones";

/**
 * Splits a Raid-Helper event's `title` (falling back to `channelName`) into the distinct set of
 * known classic raid zones it mentions. Deliberately separate from `raid-zones.ts`'s
 * `parseZoneFromEventText` — that helper matches only the *first* zone name it finds and is
 * explicitly documented there as "the acknowledged lower-trust fallback tier"; it cannot support
 * a doubleheader night (two zones raided back-to-back under one event), which real titles like
 * "Sunday BWL/MC @7PM" require. Do not modify `parseZoneFromEventText` to add this — it has other
 * callers that expect its single-zone-or-undefined contract.
 *
 * Fixed alias table, not a general-purpose NLP parser — the guild's own title conventions are
 * consistent (traced against real examples), so a bounded lookup is both sufficient and testable.
 */

// Common abbreviations raid leads actually use in Raid-Helper titles/channel names,
// traced from real examples ("Sunday BWL/MC @7PM", "Saturday ZG/AQ20 @10:30",
// "Monday AQ40 @8PM", "Thursday Onyxia"). Keys are lowercase.
const ZONE_ALIASES: Record<string, RaidZone> = {
  mc: "Molten Core",
  "molten core": "Molten Core",
  bwl: "Blackwing Lair",
  "blackwing lair": "Blackwing Lair",
  zg: "Zul'Gurub",
  "zul'gurub": "Zul'Gurub",
  zulgurub: "Zul'Gurub",
  aq20: "Ruins of Ahn'Qiraj",
  aq40: "Temple of Ahn'Qiraj",
  naxx: "Naxxramas",
  naxxramas: "Naxxramas",
  ony: "Onyxia",
  onyxia: "Onyxia",
};

const DELIMITER_PATTERN = /\/|&|,|\band\b/i;

/**
 * Returns the distinct set of known classic zones mentioned in `title` (or `channelName`
 * as a fallback), in the order first encountered. Empty array if nothing matched.
 *
 * Checks `title` before `channelName`, matching `parseZoneFromEventText`'s existing precedent
 * (title is more deliberately authored). Zones come back in first-encountered order so a
 * doubleheader's SR creation order is deterministic and matches the title's own left-to-right
 * zone order.
 */
export function parseZonesFromEventTitle(
  title: string | null | undefined,
  channelName: string | null | undefined,
): RaidZone[] {
  for (const text of [title, channelName]) {
    if (!text) continue;
    const zones = matchZonesInText(text);
    if (zones.length > 0) return zones;
  }
  return [];
}

function matchZonesInText(text: string): RaidZone[] {
  const segments = text.split(DELIMITER_PATTERN);
  const found: RaidZone[] = [];
  for (const segment of segments) {
    const zone = matchSegmentToZone(segment);
    if (zone && !found.includes(zone)) found.push(zone);
  }
  return found;
}

function matchSegmentToZone(segment: string): RaidZone | undefined {
  const lower = segment.toLowerCase();
  for (const [alias, zone] of Object.entries(ZONE_ALIASES)) {
    if (lower.includes(alias)) return zone;
  }
  return undefined;
}
