import { EmbedBuilder, type Client, type TextBasedChannel } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ADMIN_EMBED_COLOR } from "./softresEmbeds.js";
import { formatLockoutWeekLabel, getEasternDayKey, getLockoutWeekKey } from "./lockoutWeek.js";

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
const FOOTER_MARKER_PREFIX = "lockout-week:";

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

function raidIdOf(url: string): string | null {
  return parseAdminUrl(url)?.raidId ?? null;
}

async function findWeeklyBlock(client: Client, thread: TextBasedChannel, footerMarker: string) {
  // Generous limit: this thread only ever gets ~1 bot message per week, so even a handful
  // of human messages in between won't push this week's tracker out of range.
  const recent = await thread.messages.fetch({ limit: 50 });
  return recent.find(
    (m) => m.author.id === client.user?.id && m.embeds[0]?.footer?.text === footerMarker,
  );
}

/**
 * Whether the lockout week containing `timestampSec` already lists `raidId` — lets the
 * add-to-block prompt stay quiet for a raid the bot (or an earlier click) already recorded.
 * False on any lookup failure: an unneeded prompt is better than a missing one.
 */
export async function isRaidInWeeklyBlock(
  client: Client,
  raidId: string,
  timestampSec: number,
): Promise<boolean> {
  try {
    const thread = await client.channels.fetch(config.discordSoftresTokenThreadId);
    if (!thread?.isSendable() || !thread.isTextBased()) return false;
    const marker = `${FOOTER_MARKER_PREFIX}${getLockoutWeekKey(new Date(timestampSec * 1000))}`;
    const existing = await findWeeklyBlock(client, thread, marker);
    if (!existing) return false;
    return parseExistingEntries(existing.embeds[0]?.description ?? "").some(
      (e) => raidIdOf(e.url) === raidId,
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), raidId },
      "Failed to check the weekly SoftRes token block for a raid",
    );
    return false;
  }
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

// Serializes calls so two raids created within the same tick can't race a fetch-then-edit
// against each other and silently drop one's entry — cheap insurance since apps/bot has no
// storage to fall back on for reconciling a lost update after the fact.
let queue: Promise<void> = Promise.resolve();

/**
 * Finds (or creates) the current lockout week's admin-token summary message in the SoftRes
 * Token thread and merges `entries` into it, grouped by day and chronological within each day.
 * Idempotent-by-design across restarts: there is no in-memory record of "which message is this
 * week's" — every call re-derives it from the thread's own message history (matched by a
 * `lockout-week:<date>` marker in the embed footer), the same idiom `ensureZoneEmoji` uses
 * against the guild's emoji list.
 */
export async function postWeeklyTokenEntries(
  client: Client,
  entries: WeeklyTokenEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  queue = queue.then(() => postWeeklyTokenEntriesInner(client, entries));
  await queue;
}

async function postWeeklyTokenEntriesInner(
  client: Client,
  entries: WeeklyTokenEntry[],
): Promise<void> {
  try {
    const thread = await client.channels.fetch(config.discordSoftresTokenThreadId);
    if (!thread?.isSendable() || !thread.isTextBased()) {
      logger.error(
        { threadId: config.discordSoftresTokenThreadId },
        "SoftRes Token thread is not fetchable or not sendable",
      );
      return;
    }

    // Derived from the raid's own scheduled time, not "now" — a SoftRes link created early for
    // next week's raid (or a late manual /sr for a raid earlier this lockout week) must land in
    // that raid's actual week, not whichever week happens to be current when this runs. Every
    // caller passes entries for exactly one raid night (possibly several zones for a
    // doubleheader), so they always share one lockout week — entries.length >= 1 is guaranteed
    // by postWeeklyTokenEntries's own early return above.
    const weekKey = getLockoutWeekKey(new Date(entries[0]!.timestampSec * 1000));
    const footerMarker = `${FOOTER_MARKER_PREFIX}${weekKey}`;

    const existing = await findWeeklyBlock(client, thread, footerMarker);

    const existingEntries = existing
      ? parseExistingEntries(existing.embeds[0]?.description ?? "")
      : [];
    const newEntries = entries.map(
      (entry): ResolvedEntry => ({
        prefix: resolvePrefix(entry),
        url: entry.url,
        timestampSec: entry.timestampSec,
      }),
    );

    const embed = new EmbedBuilder()
      .setTitle(`SR Admin Tokens — Week of ${formatLockoutWeekLabel(weekKey)}`)
      .setColor(ADMIN_EMBED_COLOR)
      .setDescription(renderDescription(mergeEntries(existingEntries, newEntries)))
      .setFooter({ text: footerMarker });

    if (existing) {
      await existing.edit({ embeds: [embed] });
    } else {
      await thread.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to update weekly SoftRes token summary",
    );
  }
}
