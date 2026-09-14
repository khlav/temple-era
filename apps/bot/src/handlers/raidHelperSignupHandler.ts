import { type Message } from "discord.js";
import { EnsureSoftresResponseSchema } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { hasBenchButton } from "../services/hasBenchButton.js";
import { buildAdminSoftresEmbed, buildPublicSoftresEmbed } from "../services/softresEmbeds.js";
import { getZoneEmoji } from "../services/zoneEmoji.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";

// Track processed messages to prevent duplicate processing
const deduplicator = new MessageDeduplicator();

/**
 * Detects a qualifying Raid-Helper signup post and calls Phase 1's `ensure-softres` endpoint,
 * then posts an embed of the public (no-token) link(s) in the signup channel and a matching
 * admin-link embed to the configured SoftRes Token thread.
 *
 * Two deliberate inversions from every other handler in this codebase:
 *  - it acts BECAUSE the author is a bot (Raid-Helper), not despite it — gating on
 *    `message.author.id === config.discordRaidHelperBotId` rather than skipping bot authors.
 *  - it reuses the ported `hasBenchButton` check to distinguish a signup post from a
 *    roster-confirmation post (which never carries a Bench button), rather than an embed-text
 *    heuristic.
 */
export async function handleRaidHelperSignup(message: Message) {
  if (!config.discordRaidSrChannelIds.includes(message.channelId)) return;

  // Logged at info (not debug) so it survives production's default log level with no config
  // change — this is the ground truth for "is the gateway connection actually delivering
  // MessageCreate events for this channel at all," independent of who posted or why a later
  // gate might skip it.
  logger.info(
    {
      eventId: message.id,
      channelId: message.channelId,
      authorId: message.author.id,
      content: message.content,
      embedTitle: message.embeds[0]?.title,
      embedDescription: message.embeds[0]?.description,
    },
    "Saw a message in a monitored SR channel",
  );

  // Gate on IS the Raid Helper bot — the inverse of every other handler's "skip bot authors" guard.
  if (message.author.id !== config.discordRaidHelperBotId) return;

  if (!hasBenchButton(message)) {
    // not a signup post (e.g. a roster confirmation, which never carries a Bench button)
    logger.info(
      { eventId: message.id, channelId: message.channelId },
      "Raid Helper message has no Bench button, skipping",
    );
    return;
  }

  if (deduplicator.has(message.id)) {
    logger.info({ eventId: message.id }, "Raid Helper signup already processed, skipping");
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

    const title = `SRs : ${result.eventTitle}`;
    const titleUrl = `https://discord.com/channels/${config.discordServerId}/${message.channelId}/${message.id}`;
    const dateLabel = result.links[0]!.eventDate;

    if (message.channel.isSendable()) {
      const publicEmbed = buildPublicSoftresEmbed({
        title,
        titleUrl,
        dateLabel,
        links: result.links.map((link) => ({
          zone: link.zone,
          url: link.publicUrl,
          emoji: getZoneEmoji(link.zone),
        })),
      });
      await message.channel.send({ embeds: [publicEmbed] });
    } else {
      logger.error({ channelId: message.channelId }, "Raid signup channel is not sendable");
    }

    const thread = await message.client.channels.fetch(config.discordSoftresTokenThreadId);
    if (!thread || !thread.isSendable()) {
      logger.error(
        { threadId: config.discordSoftresTokenThreadId },
        "SoftRes Token thread channel is not fetchable or not sendable",
      );
      return;
    }

    const adminEmbed = buildAdminSoftresEmbed({
      title,
      titleUrl,
      dateLabel,
      links: result.links.map((link) => ({
        zone: link.zone,
        url: link.adminUrl,
        emoji: getZoneEmoji(link.zone),
      })),
    });
    await thread.send({ embeds: [adminEmbed] });
    logger.info(
      { eventId: message.id, zones: result.links.map((link) => link.zone) },
      "Posted SoftRes admin link(s) to Token thread",
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), eventId: message.id },
      "Error ensuring SoftRes link",
    );
  }
}
