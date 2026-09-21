import { ComponentType, type Message, type TextBasedChannel } from "discord.js";
import { EnsureSoftresResponseSchema } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { hasBenchButton } from "../services/hasBenchButton.js";
import { hasConfirmButton } from "../services/hasConfirmButton.js";
import { buildPublicSoftresEmbed } from "../services/softresEmbeds.js";
import { postWeeklyTokenEntries } from "../services/tokenThreadSummary.js";
import { getZoneEmoji } from "../services/zoneEmoji.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";

// Track processed messages to prevent duplicate processing — one deduplicator per Raid-Helper
// message type, since a signup post and its later roster post are two distinct Discord messages
// (different snowflakes), never colliding on the same id.
const deduplicator = new MessageDeduplicator();
const rosterDeduplicator = new MessageDeduplicator();

// Raid-Helper posts a signup message with NO components at all — the class-select dropdown and
// Bench/Late/Tentative/Absence buttons only appear once Raid-Helper finishes building the event
// out, an edit that lands some unmeasured amount of time after the initial post. Checking
// immediately on MessageCreate therefore always sees a bare, button-less message.
// `scheduleRaidHelperSignupCheck` re-fetches and re-checks on this backoff schedule (gaps between
// successive attempts, not offsets from the original post) rather than a single fixed delay,
// since we don't know the real build-out latency and a one-shot check would permanently miss any
// post slower than that guess. Still bounded and one-time per message — not a `MessageUpdate`
// listener — since every later signup/status change re-edits the same message for the rest of
// the event's life, and reacting to all of those would need its own re-entrancy handling on top
// of this.
const SIGNUP_CHECK_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 60_000];

/**
 * Entry point for MessageCreate. Cheaply filters to a Raid-Helper post in a monitored SR
 * channel (logging every monitored-channel message regardless, so the "is the gateway even
 * delivering these" question never depends on who posted or why a later gate might skip it),
 * then schedules the first delayed Bench-button check — see SIGNUP_CHECK_RETRY_DELAYS_MS.
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

  scheduleAttempt(message, 0);
}

function scheduleAttempt(message: Message, attemptIndex: number): void {
  const delayMs = SIGNUP_CHECK_RETRY_DELAYS_MS[attemptIndex];
  if (delayMs === undefined) return; // out of retries — scheduleAttempt is never called past the last index
  setTimeout(() => {
    void attemptSignupCheck(message, attemptIndex);
  }, delayMs);
}

/** Re-fetches the message — the original `Message` object is a stale snapshot from creation
 *  (message caching is disabled, so nothing updates it in place) — and either hands a fresh copy
 *  with a Bench button to `handleRaidHelperSignup`, or schedules the next backoff attempt. A
 *  failed fetch (e.g. a transient API hiccup) is treated the same as "no button yet" and also
 *  retried, up to the same bound. */
async function attemptSignupCheck(message: Message, attemptIndex: number): Promise<void> {
  const isLastAttempt = attemptIndex === SIGNUP_CHECK_RETRY_DELAYS_MS.length - 1;

  let fresh: Message;
  try {
    fresh = await message.fetch();
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        eventId: message.id,
        attempt: attemptIndex + 1,
        giving_up: isLastAttempt,
      },
      "Could not re-fetch Raid Helper signup message before checking for a Bench button",
    );
    if (!isLastAttempt) scheduleAttempt(message, attemptIndex + 1);
    return;
  }

  if (hasBenchButton(fresh)) {
    await handleRaidHelperSignup(fresh);
    return;
  }

  if (hasConfirmButton(fresh)) {
    await handleRaidHelperRoster(fresh);
    return;
  }

  if (!isLastAttempt) {
    scheduleAttempt(message, attemptIndex + 1);
    return;
  }
  // still neither post type after every retry — rarely, Raid-Helper took longer than our whole
  // backoff window; more often this is some other Raid-Helper message type entirely (e.g. an
  // announcement) that never gets either button set.
  logger.info(
    { eventId: fresh.id, channelId: fresh.channelId },
    "Raid Helper message still has no Bench or Confirm button after all retries, giving up",
  );
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
    // Defense in depth — attemptSignupCheck already verifies this before calling here, so a
    // real signup post never reaches this branch. Kept as a self-contained guard for any direct
    // caller (e.g. a test) that skips the retry loop's own check.
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

// Discord returns pages newest-first, capped at 100 per call. Mirrors the pagination in
// softresMessageCleanup.ts's findSoftresMessages, but this one only needs the *first* match (the
// bot's own SR embed is expected to still be the newest or near-newest message in the channel by
// the time a roster post lands) rather than every SR message in the channel, so it short-circuits
// instead of collecting.
const FIND_SR_EMBED_MAX_PAGES = 10;

/**
 * Both a Raid-Helper roster/confirmation embed's `.url` and our own SR embed's `.url` (set via
 * `titleUrl` above) point at the same original signup message — Raid-Helper sets the roster
 * embed's title-link back to the signup post it confirms, and we set our SR embed's the same way.
 * That's just a URL string on each embed, not a live reference, so it still matches even after
 * the signup post itself is later archived/deleted out of the channel by cleanup.
 */
function resolveEventUrl(message: Message): string | undefined {
  const embedUrl = message.embeds[0]?.url;
  if (embedUrl) return embedUrl;

  // Fallback: Raid-Helper's Confirm/Cancel button custom_ids are `confirm-{eventId}-{userId}` /
  // `cancel-{eventId}-{userId}`, where `eventId` is that same original signup message's
  // snowflake — recover it and rebuild the same URL shape, in case the embed itself ever omits
  // `.url`.
  for (const row of message.components) {
    if (row.type !== ComponentType.ActionRow) continue;
    for (const component of row.components) {
      const customId = "customId" in component ? component.customId : undefined;
      const match = customId ? /^(?:confirm|cancel)-(\d+)-/.exec(customId) : null;
      if (match?.[1]) {
        return `https://discord.com/channels/${config.discordServerId}/${message.channelId}/${match[1]}`;
      }
    }
  }
  return undefined;
}

/** Pages backwards through `channel`'s history for the bot's own message whose embed links back
 *  to `eventUrl` — i.e. the SR embed posted for this same event. Returns the first (most recent)
 *  match, or undefined if history is exhausted without one. */
async function findSoftresEmbedForEvent(
  channel: TextBasedChannel,
  botUserId: string | undefined,
  eventUrl: string,
): Promise<Message | undefined> {
  let before: string | undefined;

  for (let page = 0; page < FIND_SR_EMBED_MAX_PAGES; page++) {
    // cache: false — matches this bot's near-zero-cache invariant (see AGENTS.md); a full
    // FIND_SR_EMBED_MAX_PAGES sweep would otherwise populate the message cache on every roster.
    const batch = await channel.messages.fetch({ limit: 100, before, cache: false });
    if (batch.size === 0) break;

    const match = [...batch.values()].find(
      (m) => m.author.id === botUserId && m.embeds[0]?.url === eventUrl,
    );
    if (match) return match;

    // Discord returns each page newest-first, so the collection's last entry is the oldest.
    const oldestInBatch = batch.last();
    if (!oldestInBatch) break;
    before = oldestInBatch.id;
  }

  return undefined;
}

/**
 * Handles a Raid-Helper roster/confirmation post (Confirm/Cancel buttons, posted once signups
 * for an event are locked in) by finding the bot's own SoftRes embed for that same event and
 * forwarding it into the channel right after — so the SR link(s) stay visible near the final
 * roster instead of scrolled off up near the original signup post.
 */
export async function handleRaidHelperRoster(message: Message): Promise<void> {
  if (!hasConfirmButton(message)) {
    // Defense in depth — attemptSignupCheck already verifies this before calling here. Kept as
    // a self-contained guard for any direct caller (e.g. a test) that skips the retry loop.
    logger.info(
      { eventId: message.id, channelId: message.channelId },
      "Raid Helper message has no Confirm button, skipping roster forward",
    );
    return;
  }

  if (rosterDeduplicator.has(message.id)) {
    logger.info({ eventId: message.id }, "Raid Helper roster already processed, skipping");
    return;
  }
  rosterDeduplicator.add(message.id);

  const eventUrl = resolveEventUrl(message);
  if (!eventUrl) {
    logger.warn(
      { eventId: message.id, channelId: message.channelId },
      "Could not resolve the original signup message from a Raid Helper roster post",
    );
    return;
  }

  try {
    const srMessage = await findSoftresEmbedForEvent(
      message.channel,
      message.client.user?.id,
      eventUrl,
    );
    if (!srMessage) {
      logger.info(
        { eventId: message.id, channelId: message.channelId },
        "No matching SoftRes embed found for this roster post",
      );
      return;
    }

    if (!message.channel.isSendable()) {
      logger.error({ channelId: message.channelId }, "Roster channel is not sendable");
      return;
    }

    await srMessage.forward(message.channel);
    logger.info(
      { eventId: message.id, softresMessageId: srMessage.id, channelId: message.channelId },
      "Forwarded the SoftRes embed after the roster post",
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), eventId: message.id },
      "Error forwarding SoftRes embed for roster post",
    );
  }
}
