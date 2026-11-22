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
 * The one concession to a human typing the title is `matchSegmentByNearMiss` below: a single-edit
 * typo in an abbreviation still resolves, because a title that half-parses silently loses that
 * raid's soft reserves entirely.
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
  "ruins of ahn'qiraj": "Ruins of Ahn'Qiraj",
  aq40: "Temple of Ahn'Qiraj",
  "temple of ahn'qiraj": "Temple of Ahn'Qiraj",
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
  return matchSegmentByNearMiss(lower);
}

// A near miss is only considered for aliases of at least this length. "mc"/"zg"/"kt" are too
// short for an edit-distance guess to mean anything — every three-letter word in a title would
// be one edit from one of them.
const MIN_FUZZY_ALIAS_LENGTH = 3;

/**
 * One-typo tolerance, the reason this exists: on 2026-11-22 a Saturday doubleheader went up as
 * "Saturday ZG/AG20 @ 6:00PM". `AG20` matched no alias, so the event got exactly one SR — ZG —
 * and the AQ20 half of the night had no soft-reserve link at all until a human noticed, four
 * days later. Nothing in the flow could tell "this title names one zone" from "this title names
 * two and we understood one of them", so the miss was silent.
 *
 * Deliberately narrow: an alias of at least `MIN_FUZZY_ALIAS_LENGTH` characters, a single edit,
 * and the whole word has to be the near miss — a near miss *inside* a longer word is a
 * coincidence, not a typo. An ambiguous word (one edit from aliases naming different zones, e.g.
 * "AQ30" sitting between AQ20 and AQ40) resolves to nothing rather than to a guess, since
 * creating an SR for the wrong raid is worse than creating none.
 */
function matchSegmentByNearMiss(lowerSegment: string): RaidZone | undefined {
  for (const word of lowerSegment.split(/[^a-z0-9']+/)) {
    if (word.length < MIN_FUZZY_ALIAS_LENGTH) continue;
    const candidates = new Set<RaidZone>();
    for (const [alias, zone] of Object.entries(ZONE_ALIASES)) {
      if (alias.length < MIN_FUZZY_ALIAS_LENGTH) continue;
      if (isWithinOneEdit(word, alias)) candidates.add(zone);
    }
    if (candidates.size === 1) return [...candidates][0];
  }
  return undefined;
}

/** Levenshtein distance <= 1, without building the full matrix for two short strings. */
function isWithinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;

  if (shorter.length === longer.length) {
    let differences = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i] && ++differences > 1) return false;
    }
    return true;
  }

  // One insertion: the strings must agree either side of a single skipped character in `longer`.
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) {
      return shorter.slice(i) === longer.slice(i + 1);
    }
  }
  return true;
}
