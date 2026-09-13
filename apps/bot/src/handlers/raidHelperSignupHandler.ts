import { type Message } from "discord.js";
import { EnsureSoftresResponseSchema } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { hasBenchButton } from "../services/hasBenchButton.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";

// Track processed messages to prevent duplicate processing
const deduplicator = new MessageDeduplicator();

/**
 * Detects a qualifying Raid-Helper signup post and calls Phase 1's `ensure-softres` endpoint,
 * then posts any returned admin links to the configured SoftRes Token thread.
 *
 * Two deliberate inversions from every other handler in this codebase:
 *  - it acts BECAUSE the author is a bot (Raid-Helper), not despite it — gating on
 *    `message.author.id === config.discordRaidHelperBotId` rather than skipping bot authors.
 *  - it reuses the ported `hasBenchButton` check to distinguish a signup post from a
 *    roster-confirmation post (which never carries a Bench button), rather than an embed-text
 *    heuristic.
 */
export async function handleRaidHelperSignup(message: Message) {
  // Gate on IS the Raid Helper bot — the inverse of every other handler's "skip bot authors" guard.
  if (message.author.id !== config.discordRaidHelperBotId) return;
  if (!config.discordRaidSrChannelIds.includes(message.channelId)) return;
  if (!hasBenchButton(message)) return; // not a signup post (e.g. a roster confirmation)

  if (deduplicator.has(message.id)) {
    logger.debug(`Raid Helper signup ${message.id} already processed, skipping`);
    return;
  }
  deduplicator.add(message.id);

  try {
    logger.info(
      { eventId: message.id, channelId: message.channelId },
      "Checking signup post for SoftRes link",
    );

    const response = await fetch(`${config.apiBaseUrl}/api/discord/ensure-softres`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.templeWebApiToken}`,
      },
      body: JSON.stringify({ eventId: message.id }),
    });

    const payload: unknown = await response.json();
    const parsed = EnsureSoftresResponseSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error(
        {
          endpoint: "/api/discord/ensure-softres",
          eventId: message.id,
          error: parsed.error.message,
        },
        "Unexpected response shape from ensure-softres",
      );
      return;
    }
    const result = parsed.data;

    if (!("success" in result) || !result.success) {
      logger.error(
        { eventId: message.id, error: "error" in result ? result.error : "unknown" },
        "ensure-softres reported failure",
      );
      return;
    }

    if (!result.created || result.links.length === 0) {
      logger.debug({ eventId: message.id }, "No SoftRes creation needed");
      return;
    }

    const thread = await message.client.channels.fetch(config.discordSoftresTokenThreadId);
    if (!thread || !thread.isSendable()) {
      logger.error(
        { threadId: config.discordSoftresTokenThreadId },
        "SoftRes Token thread channel is not fetchable or not sendable",
      );
      return;
    }

    for (const link of result.links) {
      await thread.send(`${link.zone} ${link.eventDate}: ${link.adminUrl}`);
      logger.info(
        { eventId: message.id, zone: link.zone },
        "Posted SoftRes admin link to Token thread",
      );
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), eventId: message.id },
      "Error ensuring SoftRes link",
    );
  }
}
