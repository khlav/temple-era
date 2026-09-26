import { ADMIN_EMBED_COLOR, type EmbedData } from "./embeds.js";
import { formatLockoutWeekLabel, getEasternDayKey, getLockoutWeekKey } from "./lockout-week.js";

export interface WeeklyTokenEntry {
  zone: string;
  url: string;
  emoji?: string;
  /** Unix seconds — the raid's actual scheduled time for `ensure-softres` entries, or the
   * creation instant for a manual `/sr` (which has no raid-night concept of its own). This is
   * the sort/grouping key, so "chronological, grouped by day" holds even when raids are
   * created out of order. */
  timestampSec: number;
}

const ET_TIME_ZONE = "America/New_York";
export const FOOTER_MARKER_PREFIX = "lockout-week:";

// Short labels for the "2nd-level bullet" line — full zone names would make every line wrap.
const SHORT_ZONE_NAMES: Record<string, string> = {
  "Molten Core": "MC",
  "Blackwing Lair": "BWL",
  "Temple of Ahn'Qiraj": "AQ40",
  Naxxramas: "Naxx",
  Onyxia: "Ony",
  "Zul'Gurub": "ZG",
  "Ruins of Ahn'Qiraj": "AQ20",
};

/** Already-resolved display text for a raid-night bullet — "resolved" so a freshly-supplied
 * `WeeklyTokenEntry` (which has a real `zone`) and one recovered from a previously-rendered
 * message (which only has the rendered prefix text, not the zone it came from) share one shape.
 * The "@ time" portion is deliberately NOT stored here — it's re-derived from `timestampSec` on
 * every render, so a future format tweak reformats old entries too instead of freezing them. */
interface ResolvedEntry {
  /** e.g. "🔥 BWL" (emoji + short zone name), verbatim text for the bullet's line prefix. */
  prefix: string;
  /** The real admin URL (no `#ts=` suffix). */
  url: string;
  timestampSec: number;
}

function shortZoneName(zone: string): string {
  return SHORT_ZONE_NAMES[zone] ?? zone;
}

function resolvePrefix(entry: WeeklyTokenEntry): string {
  const name = shortZoneName(entry.zone);
  return entry.emoji ? `${entry.emoji} ${name}` : name;
}

/** "7pm" on the hour, "6:30pm" otherwise — flat and short so a day's raids stay on one line each. */
function formatShortTime(timestampSec: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(timestampSec * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const hour = get("hour");
  const minute = get("minute");
  const meridiem = get("dayPeriod").toLowerCase();
  return minute === "00" ? `${hour}${meridiem}` : `${hour}:${minute}${meridiem}`;
}

/** "Tuesday 9/15" for the 1st-level (day) bullet. */
function formatDayHeader(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    weekday: "long",
  }).format(date);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    month: "numeric",
    day: "numeric",
  }).format(date);
  return `${weekday} ${monthDay}`;
}

/** "Tuesday 9/29 @ 7pm" — the same day/time wording the block itself uses, for prompts that
 * describe an entry before it is added. */
export function formatRaidWhen(timestampSec: number): string {
  return `${formatDayHeader(timestampSec)} @ ${formatShortTime(timestampSec)}`;
}

function parseAdminUrl(url: string): { raidId: string; adminToken: string } | null {
  // Anchored to the end of the value (`&`/`#`/end-of-string): an unanchored `[a-zA-Z0-9]+`
  // would silently truncate a raidId or token containing `-`/`_`/`.`, showing a wrong value in
  // the label even though the underlying link (which uses the untouched `url`) still works.
  const match = /\/raid\/([\w.-]+)\?adminToken=([\w.-]+)(?=$|&|#)/.exec(url);
  return match ? { raidId: match[1]!, adminToken: match[2]! } : null;
}

/** The raid id in a softres.it admin link, or null if the link has an unexpected shape. */
export function adminUrlRaidId(url: string): string | null {
  return parseAdminUrl(url)?.raidId ?? null;
}

const raidIdOf = adminUrlRaidId;

/** `[raidId | admintoken: value](url)` — concise enough that the line doesn't wrap, and still a
 * real working link. Falls back to a plain link if the URL doesn't match the expected shape,
 * rather than dropping the entry. The real URL carries a `#ts=<unix>` suffix so the timestamp
 * survives a round trip through the rendered message text — softres.it ignores the fragment. */
function renderLink(url: string, timestampSec: number): string {
  const parsed = parseAdminUrl(url);
  const label = parsed ? `${parsed.raidId} | admintoken: ${parsed.adminToken}` : "link";
  return `[${label}](${url}#ts=${timestampSec})`;
}

function renderEntryLine(entry: ResolvedEntry): string {
  return `  - ${entry.prefix} @ ${formatShortTime(entry.timestampSec)} — ${renderLink(entry.url, entry.timestampSec)}`;
}

function renderDescription(entries: ResolvedEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.timestampSec - b.timestampSec);
  const dayGroups = new Map<string, ResolvedEntry[]>();
  for (const entry of sorted) {
    const dayKey = getEasternDayKey(new Date(entry.timestampSec * 1000));
    const group = dayGroups.get(dayKey);
    if (group) group.push(entry);
    else dayGroups.set(dayKey, [entry]);
  }

  const lines: string[] = [];
  for (const group of dayGroups.values()) {
    lines.push(`- **${formatDayHeader(group[0]!.timestampSec)}**`);
    lines.push(...group.map(renderEntryLine));
  }
  return lines.join("\n");
}

// Current format: "  - {prefix} @ {time} — [label](url#ts=UNIX)". The `#ts=` fragment, not the
// display time, is the recoverable sort key.
const ENTRY_LINE_REGEX = /^ {2}- (.+?) @ \S+ — \[.+?\]\((.+?)#ts=(\d+)\)$/;
// Pre-this-feature-revision format: "<t:UNIX:f> {emoji }{zone}: {url}" (flat, no day grouping).
// Parsed as a fallback so a format change mid-lockout-week doesn't drop that week's
// already-posted entries on the next edit. The optional emoji group is anchored to actual
// Discord custom-emoji syntax — a looser `\S+` would swallow the first word of a multi-word,
// emoji-less zone (e.g. "Molten Core" with no emoji) as if it were one, leaving the recovered
// zone as just "Core" and losing the SHORT_ZONE_NAMES shortening on that entry.
const LEGACY_LINE_REGEX = /^<t:(\d+):f> (?:(<a?:\w+:\d+>) )?(.+?): (\S+)$/;

function parseExistingEntries(description: string): ResolvedEntry[] {
  return description.split("\n").flatMap((line): ResolvedEntry[] => {
    const current = ENTRY_LINE_REGEX.exec(line);
    if (current) {
      return [{ prefix: current[1]!, url: current[2]!, timestampSec: Number(current[3]) }];
    }
    const legacy = LEGACY_LINE_REGEX.exec(line);
    if (legacy) {
      const [, ts, emoji, zone, url] = legacy;
      const name = shortZoneName(zone!);
      return [{ prefix: emoji ? `${emoji} ${name}` : name, url: url!, timestampSec: Number(ts) }];
    }
    return [];
  });
}

/** A raid appears once: re-adding one (a corrected time, a second click) replaces its old line
 * rather than duplicating it. Entries whose URL has no parseable raid id can't be matched and are
 * kept as they are. */
function mergeEntries(existing: ResolvedEntry[], added: ResolvedEntry[]): ResolvedEntry[] {
  const addedIds = new Set(
    added.map((e) => raidIdOf(e.url)).filter((id): id is string => id !== null),
  );
  const kept = existing.filter((e) => {
    const id = raidIdOf(e.url);
    return id === null || !addedIds.has(id);
  });
  return [...kept, ...added];
}

/**
 * The footer that marks a message as a given lockout week's block. Derived from the raid's own
 * scheduled time, not "now" — a SoftRes link created early for next week's raid (or a late manual
 * /sr for a raid earlier this lockout week) must land in that raid's actual week.
 */
export function weeklyBlockFooter(timestampSec: number): string {
  return `${FOOTER_MARKER_PREFIX}${getLockoutWeekKey(new Date(timestampSec * 1000))}`;
}

/** Whether a rendered block description already lists this raid id. */
export function blockHasRaid(description: string, raidId: string): boolean {
  return parseExistingEntries(description).some((e) => raidIdOf(e.url) === raidId);
}

/**
 * The week's "SR Admin Tokens" embed: `existingDescription` (the current message's text, if the
 * block already exists) merged with `entries`, grouped by day and chronological within each day.
 * Every entry must belong to the same raid night (possibly several zones for a doubleheader), so
 * they share one lockout week — the first entry's time decides which.
 */
export function buildWeeklyBlockEmbed(
  existingDescription: string | undefined,
  entries: WeeklyTokenEntry[],
): EmbedData {
  if (entries.length === 0) throw new Error("buildWeeklyBlockEmbed needs at least one entry");
  const first = entries[0]!;
  const weekKey = getLockoutWeekKey(new Date(first.timestampSec * 1000));

  const added = entries.map(
    (entry): ResolvedEntry => ({
      prefix: resolvePrefix(entry),
      url: entry.url,
      timestampSec: entry.timestampSec,
    }),
  );
  const existing = existingDescription ? parseExistingEntries(existingDescription) : [];

  return {
    title: `SR Admin Tokens — Week of ${formatLockoutWeekLabel(weekKey)}`,
    color: ADMIN_EMBED_COLOR,
    description: renderDescription(mergeEntries(existing, added)),
    footer: { text: `${FOOTER_MARKER_PREFIX}${weekKey}` },
  };
}
