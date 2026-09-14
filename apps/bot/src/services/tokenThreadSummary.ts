import { EmbedBuilder, type Client } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ADMIN_EMBED_COLOR } from "./softresEmbeds.js";
import { formatLockoutWeekLabel, getLockoutWeekKey } from "./lockoutWeek.js";

export interface WeeklyTokenEntry {
  zone: string;
  url: string;
  emoji?: string;
  /** Unix seconds — the raid's actual scheduled time for `ensure-softres` entries, or the
   * creation instant for a manual `/sr` (which has no raid-night concept of its own). This is
   * the sort key, so "chronological" holds even when raids are created out of order. */
  timestampSec: number;
}

const FOOTER_MARKER_PREFIX = "lockout-week:";

interface ParsedLine {
  timestampSec: number;
  line: string;
}

function renderLine(entry: WeeklyTokenEntry): string {
  const prefix = entry.emoji ? `${entry.emoji} ` : "";
  return `<t:${entry.timestampSec}:f> ${prefix}${entry.zone}: ${entry.url}`;
}

/** Recovers `{ timestampSec, line }` pairs from a previously-rendered description — the
 * leading `<t:UNIX:f>` token on each line doubles as its own sort key, so there's no separate
 * metadata payload to keep in sync with the visible text. */
function parseExistingLines(description: string): ParsedLine[] {
  return description
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const match = /^<t:(\d+):f>/.exec(line);
      return match ? [{ timestampSec: Number(match[1]), line }] : [];
    });
}

// Serializes calls so two raids created within the same tick can't race a fetch-then-edit
// against each other and silently drop one's entry — cheap insurance since apps/bot has no
// storage to fall back on for reconciling a lost update after the fact.
let queue: Promise<void> = Promise.resolve();

/**
 * Finds (or creates) the current lockout week's admin-token summary message in the SoftRes
 * Token thread and merges `entries` into it, chronologically. Idempotent-by-design across
 * restarts: there is no in-memory record of "which message is this week's" — every call
 * re-derives it from the thread's own message history (matched by a `lockout-week:<date>`
 * marker in the embed footer), the same idiom `ensureZoneEmoji` uses against the guild's
 * emoji list.
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

    const weekKey = getLockoutWeekKey(new Date());
    const footerMarker = `${FOOTER_MARKER_PREFIX}${weekKey}`;

    // Generous limit: this thread only ever gets ~1 bot message per week, so even a handful
    // of human messages in between won't push this week's tracker out of range.
    const recent = await thread.messages.fetch({ limit: 50 });
    const existing = recent.find(
      (m) => m.author.id === client.user?.id && m.embeds[0]?.footer?.text === footerMarker,
    );

    const existingLines = existing ? parseExistingLines(existing.embeds[0]?.description ?? "") : [];
    const newLines = entries.map((entry) => ({
      timestampSec: entry.timestampSec,
      line: renderLine(entry),
    }));
    const merged = [...existingLines, ...newLines].sort((a, b) => a.timestampSec - b.timestampSec);

    const embed = new EmbedBuilder()
      .setTitle(`SR Admin Tokens — Week of ${formatLockoutWeekLabel(weekKey)}`)
      .setColor(ADMIN_EMBED_COLOR)
      .setDescription(merged.map((entry) => entry.line).join("\n"))
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
