import { EmbedBuilder, type Client, type TextBasedChannel } from "discord.js";
import {
  blockHasRaid,
  buildWeeklyBlockEmbed,
  weeklyBlockFooter,
  type WeeklyTokenEntry,
} from "@temple-era/softres-blocks";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

export { formatRaidWhen, type WeeklyTokenEntry } from "@temple-era/softres-blocks";

// What the block says — its rendering, parsing and merge rules — lives in
// `@temple-era/softres-blocks`, shared with the web app's Templar create-SR endpoint so both
// write the same message in the same format. This file is the bot's Discord transport for it.

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
    const existing = await findWeeklyBlock(client, thread, weeklyBlockFooter(timestampSec));
    if (!existing) return false;
    return blockHasRaid(existing.embeds[0]?.description ?? "", raidId);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), raidId },
      "Failed to check the weekly SoftRes token block for a raid",
    );
    return false;
  }
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

    // Every caller passes entries for exactly one raid night (possibly several zones for a
    // doubleheader), so they share one lockout week — entries.length >= 1 is guaranteed by
    // postWeeklyTokenEntries's own early return above.
    const existing = await findWeeklyBlock(
      client,
      thread,
      weeklyBlockFooter(entries[0]!.timestampSec),
    );
    const embed = new EmbedBuilder(
      buildWeeklyBlockEmbed(existing?.embeds[0]?.description ?? undefined, entries),
    );

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
