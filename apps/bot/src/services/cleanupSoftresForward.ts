import type { Client, Message, TextBasedChannel } from "discord.js";
import {
  parsePublicSoftresEmbedLinks,
  publicUrlRaidId,
  weeklyBlockRaidsForZone,
} from "@temple-era/softres-blocks";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { buildPublicSoftresEmbed } from "./softresEmbeds.js";
import { getWeeklyBlockDescription } from "./tokenThreadSummary.js";
import { getZoneEmoji } from "./zoneEmoji.js";

/**
 * Clean-up raids (TEMPLE-169). When a night ends without clearing all of Naxxramas, the rest is
 * finished on a clean-up raid later in the same lockout week, signed up for in its own channel.
 * It reuses that week's Naxx SR, so instead of creating an SR the bot forwards the existing
 * "SRs : ..." post into the clean-up channel — what raid leads were doing by hand.
 */
export const CLEANUP_ZONE = "Naxxramas";

// Pages of 100 searched per SR channel for the week's public post. The post goes up when signups
// open, about a week before its raid, and a signup channel sees little traffic in between.
const FIND_POST_MAX_PAGES = 3;

/**
 * The event's scheduled time from a Raid-Helper signup embed — its date field renders as a
 * `<t:UNIX:D>` Discord timestamp. Falls back to when the signup was posted, which is in the same
 * lockout week for any clean-up scheduled after the night it continues.
 */
export function cleanupEventTimestampSec(message: Message): number {
  const embed = message.embeds[0];
  const text = [embed?.description ?? "", ...(embed?.fields ?? []).map((f) => f.value)].join("\n");
  const match = /<t:(\d+):/.exec(text);
  return match ? Number(match[1]) : Math.floor(message.createdTimestamp / 1000);
}

/**
 * The SR the clean-up continues: the week's last Naxx SR at or before the clean-up, or the
 * week's first if every listed one is later (a block entry for a manual `/sr` carries its
 * creation time, not the raid's).
 */
export function pickWeekRaidId(
  raids: Array<{ raidId: string; timestampSec: number }>,
  cleanupTimestampSec: number,
): string | undefined {
  const before = raids.filter((r) => r.timestampSec <= cleanupTimestampSec);
  return (before.at(-1) ?? raids[0])?.raidId;
}

/** The bot's own public "SRs : ..." post linking `raidId`, newest first across the SR channels. */
async function findPublicSoftresPost(client: Client, raidId: string): Promise<Message | undefined> {
  for (const channelId of config.discordRaidSrChannelIds) {
    let channel: TextBasedChannel;
    try {
      const fetched = await client.channels.fetch(channelId);
      if (!fetched?.isTextBased()) continue;
      channel = fetched;
    } catch (error) {
      logger.warn(
        { channelId, error: error instanceof Error ? error.message : String(error) },
        "Could not fetch an SR channel while looking for the week's SR post",
      );
      continue;
    }

    let before: string | undefined;
    for (let page = 0; page < FIND_POST_MAX_PAGES; page++) {
      // cache: false — the bot's near-zero-cache invariant (see AGENTS.md).
      const batch = await channel.messages.fetch({ limit: 100, before, cache: false });
      if (batch.size === 0) break;

      const match = [...batch.values()].find(
        (m) =>
          m.author.id === client.user?.id &&
          parsePublicSoftresEmbedLinks(m.embeds[0]?.description ?? "").some(
            (link) => publicUrlRaidId(link.url) === raidId,
          ),
      );
      if (match) return match;

      before = batch.last()?.id;
      if (!before) break;
    }
  }
  return undefined;
}

/**
 * Forwards the lockout week's Naxx SR post to a clean-up signup's channel. If the original post
 * can't be found (cleaned up, or the SR was never posted publicly), posts a fresh public embed
 * with the same link instead, so the clean-up still gets it. Does nothing when the week has no
 * Naxx SR in the Token thread — there is nothing to reuse, and creating one is not this flow's job.
 */
export async function forwardWeekSoftresToCleanup(message: Message): Promise<void> {
  const cleanupTimestampSec = cleanupEventTimestampSec(message);

  const blockDescription = await getWeeklyBlockDescription(message.client, cleanupTimestampSec);
  const raidId = pickWeekRaidId(
    weeklyBlockRaidsForZone(blockDescription ?? "", CLEANUP_ZONE),
    cleanupTimestampSec,
  );
  if (!raidId) {
    logger.info(
      { eventId: message.id, cleanupTimestampSec },
      "No Naxx SR in this lockout week's Token-thread block; nothing to forward to the clean-up",
    );
    return;
  }

  if (!message.channel.isSendable()) {
    logger.error({ channelId: message.channelId }, "Clean-up channel is not sendable");
    return;
  }

  const post = await findPublicSoftresPost(message.client, raidId);
  if (post) {
    await post.forward(message.channel);
    logger.info(
      { eventId: message.id, raidId, softresMessageId: post.id },
      "Forwarded the week's Naxx SR post to the clean-up signup",
    );
    return;
  }

  await message.channel.send({
    embeds: [
      buildPublicSoftresEmbed({
        title: "SRs : Naxx clean-up",
        titleUrl: `https://discord.com/channels/${config.discordServerId}/${message.channelId}/${message.id}`,
        dateLabel: "Same SR as this week's Naxx",
        links: [
          {
            zone: CLEANUP_ZONE,
            url: `https://softres.it/raid/${raidId}`,
            emoji: getZoneEmoji(CLEANUP_ZONE),
          },
        ],
      }),
    ],
  });
  logger.info(
    { eventId: message.id, raidId },
    "Week's Naxx SR post not found; posted its public link to the clean-up signup instead",
  );
}
