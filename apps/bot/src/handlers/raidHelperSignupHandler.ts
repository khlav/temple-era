import { type Message } from "discord.js";
import { EnsureSoftresResponseSchema } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { hasBenchButton } from "../services/hasBenchButton.js";
import { buildPublicSoftresEmbed } from "../services/softresEmbeds.js";
import { postWeeklyTokenEntries } from "../services/tokenThreadSummary.js";
import { getZoneEmoji } from "../services/zoneEmoji.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";

// Track processed messages to prevent duplicate processing
const deduplicator = new MessageDeduplicator();

// Raid-Helper posts a signup message with NO components at all — the class-select dropdown and
// Bench/Late/Tentative/Absence buttons only appear once Raid-Helper finishes building the event
// out, an edit that lands some unmeasured amount of time after the initial post. Checking
// immediately on MessageCreate therefore always sees a bare, button-less message, so
// `scheduleRaidHelperSignupCheck` waits this long, then re-fetches the message once and checks
// the fresh copy — a single delayed look rather than reacting to every one of the message's many
// later edits (every subsequent signup/status change re-edits the same message for the rest of
// the event's life), which would need its own re-entrancy handling this doesn't have.
const SIGNUP_CHECK_DELAY_MS = 10_000;

/**
 * Entry point for MessageCreate. Cheaply filters to a Raid-Helper post in a monitored SR
 * channel (logging every monitored-channel message regardless, so the "is the gateway even
 * delivering these" question never depends on who posted or why a later gate might skip it),
 * then schedules the single delayed Bench-button check — see SIGNUP_CHECK_DELAY_MS.
 *
 * Deliberate inversion from every other handler in this codebase: it acts BECAUSE the author is
 * a bot (Raid-Helper), not despite it — gating on `message.author.id ===
 * config.discordRaidHelperBotId` rather than skipping bot authors.
 */
export function scheduleRaidHelperSignupCheck(message: Message): void {
  if (!config.discordRaidSrChannelIds.includes(message.channelId)) return;

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

  if (message.author.id !== config.discordRaidHelperBotId) return;

  setTimeout(() => {
    void recheckAndProcessSignup(message);
  }, SIGNUP_CHECK_DELAY_MS);
}

/** Re-fetches the message after the delay — the original `Message` object is a stale snapshot
 *  from creation (message caching is disabled, so nothing updates it in place) — then hands the
 *  fresh copy to `handleRaidHelperSignup`. */
async function recheckAndProcessSignup(message: Message): Promise<void> {
  let fresh: Message;
  try {
    fresh = await message.fetch();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), eventId: message.id },
      "Could not re-fetch Raid Helper signup message before checking for a Bench button",
    );
    return;
  }

  await handleRaidHelperSignup(fresh);
}

/**
 * Checks an already-gated, freshly-fetched Raid-Helper signup message for a Bench button — it
 * reuses the ported `hasBenchButton` check to distinguish a signup post from a
 * roster-confirmation post (which never carries a Bench button), rather than an embed-text
 * heuristic — and if found, calls Phase 1's `ensure-softres` endpoint, then posts an embed of the
 * public (no-token) link(s) in the signup channel and merges the matching admin link(s) into
 * that lockout week's summary message in the SoftRes Token thread.
 */
export async function handleRaidHelperSignup(message: Message): Promise<void> {
  if (!hasBenchButton(message)) {
    // still not a signup post after the delay (e.g. a roster confirmation, which never carries
    // a Bench button — or, rarely, Raid-Helper just hasn't finished building it out yet)
    logger.info(
      { eventId: message.id, channelId: message.channelId },
      "Raid Helper message still has no Bench button after the delay, skipping",
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

    await postWeeklyTokenEntries(
      message.client,
      result.links.map((link) => ({
        zone: link.zone,
        url: link.adminUrl,
        emoji: getZoneEmoji(link.zone),
        timestampSec: link.eventTimestamp,
      })),
    );
    logger.info(
      { eventId: message.id, zones: result.links.map((link) => link.zone) },
      "Merged SoftRes admin link(s) into the weekly Token thread summary",
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), eventId: message.id },
      "Error ensuring SoftRes link",
    );
  }
}
