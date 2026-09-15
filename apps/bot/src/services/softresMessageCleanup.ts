import { type Client, type Message } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

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

/**
 * Deletes old SoftRes signup-reminder messages from the monitored SR channels, run as part of
 * the same nightly cleanup as `cleanupOldThreads`. Always keeps the newest SR post per channel
 * regardless of age — that's "this raid's" post — and deletes everything older than
 * `threadCleanupDays` behind it. Ranking by recency rather than a fixed cutoff means this stays
 * correct however raid cadence shifts (a skipped week, two posts close together) without needing
 * to know the raid schedule itself.
 */
export async function cleanupOldSoftresMessages(client: Client): Promise<void> {
  if (!config.threadCleanupEnabled) return;

  const cutoffTime = Date.now() - config.threadCleanupDays * 24 * 60 * 60 * 1000;

  for (const channelId of config.discordRaidSrChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        logger.error({ channelId }, "SR channel is not fetchable or not text-based");
        continue;
      }

      const recent = await channel.messages.fetch({ limit: 100 });
      const srMessages = [...recent.values()]
        .filter((m) => isSoftresMessage(m, client.user?.id))
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

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
