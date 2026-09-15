import { type Client, type Message, type TextBasedChannel } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

// Discord returns pages newest-first, capped at 100 per call — a single unpaginated fetch
// would miss any SR post pushed past that window by ordinary channel chatter (raid banter,
// reactions to the signup itself), leaving it undeletable forever. This safety-caps the number
// of pages fetched per channel per run (1000 messages) rather than paging indefinitely — real
// channels only carry a handful of SR posts, so exhausting history (an empty page) is expected
// to happen well before this in practice.
const MAX_PAGES = 10;

// Both the auto-signup flow (raidHelperSignupHandler.ts) and the manual /sr command post
// through the same buildPublicSoftresEmbed, always titled "SRs : {eventTitle}" — a reliable
// fingerprint for "this is one of our SR posts" that doesn't depend on it being the only kind
// of bot message a channel could ever contain.
const SR_EMBED_TITLE_PREFIX = "SRs :";

function isSoftresMessage(message: Message, botUserId: string | undefined): boolean {
  return (
    message.author.id === botUserId && !!message.embeds[0]?.title?.startsWith(SR_EMBED_TITLE_PREFIX)
  );
}

/** Pages backwards through `channel`'s history (newest page first) collecting SR messages,
 * until history is exhausted (an empty page) or `MAX_PAGES` is hit. Deliberately does NOT stop
 * early on crossing the delete cutoff — the far side of that cutoff is exactly where the old SR
 * posts this job exists to find live, so stopping there would mean never reaching them. Returned
 * newest-first. */
async function findSoftresMessages(
  channel: TextBasedChannel,
  botUserId: string | undefined,
): Promise<Message[]> {
  const found: Message[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    found.push(...[...batch.values()].filter((m) => isSoftresMessage(m, botUserId)));

    const oldestInBatch = [...batch.values()].reduce((a, b) =>
      a.createdTimestamp < b.createdTimestamp ? a : b,
    );
    before = oldestInBatch.id;
  }

  return found.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

/**
 * Deletes old SoftRes signup-reminder messages from the monitored SR channels, run as part of
 * the same nightly cleanup as `cleanupOldThreads`. Always keeps the newest SR post per channel
 * regardless of age — that's "this raid's" post — and deletes everything older than
 * `threadCleanupDays` behind it. Ranking by recency rather than a fixed cutoff means this stays
 * correct however raid cadence shifts (a skipped week, two posts close together) without needing
 * to know the raid schedule itself.
 *
 * "Keep only the newest" relies on there never being two live (not-yet-occurred) SR posts in one
 * channel at once — otherwise an early post for a still-upcoming raid could rank behind a later
 * one and get deleted while still relevant. Every configured SR channel is a single weekday's
 * raid channel (e.g. "mon-aq40", "wed-zg"), so that only requires next week's post to never
 * appear before this week's raid has happened. Checked against real posting history across
 * several channels: next week's signup consistently appears shortly AFTER the current week's
 * raid, never before it (e.g. "tues-naxx" 9/8's post superseded by 9/15's the very next day,
 * once 9/8 had already happened) — so this holds today. It would need revisiting if raid
 * officers start opening signups more than `threadCleanupDays` ahead of the raid itself.
 */
export async function cleanupOldSoftresMessages(client: Client): Promise<void> {
  if (!config.threadCleanupEnabled) return;

  const cutoffTime = Date.now() - config.threadCleanupDays * 24 * 60 * 60 * 1000;

  for (const channelId of config.discordRaidSrChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        logger.warn({ channelId }, "SR channel is not fetchable or not text-based");
        continue;
      }

      const srMessages = await findSoftresMessages(channel, client.user?.id);

      // The first (newest) entry is always kept — only messages behind it are eligible.
      const deletable = srMessages.slice(1).filter((m) => m.createdTimestamp < cutoffTime);

      if (deletable.length === 0) continue;

      let deletedCount = 0;
      for (const message of deletable) {
        try {
          await message.delete();
          deletedCount++;
        } catch (error) {
          logger.error(
            { err: error, channelId, messageId: message.id },
            "Failed to delete old SoftRes message",
          );
        }
      }
      logger.info(
        { channelId, deletedCount, total: deletable.length },
        "SoftRes message cleanup completed for channel",
      );
    } catch (error) {
      logger.error({ err: error, channelId }, "SoftRes message cleanup failed for channel");
    }
  }
}
