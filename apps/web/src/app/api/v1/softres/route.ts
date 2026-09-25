import { NextResponse } from "next/server";
import { z } from "zod";
import { buildPublicSoftresEmbedData } from "@temple-era/softres-blocks";
import { env } from "~/env.js";
import { logger } from "~/lib/logger";
import { SCOPE } from "~/lib/scopes";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { getZoneForInstance } from "~/lib/raid-zones";
import { SOFTRES_CREATE_INSTANCE_IDS } from "~/lib/softres-create-instance-ids";
import { parseZonesFromEventTitle } from "~/lib/softres-doubleheader-parser";
import { createSoftResRaid } from "~/server/api/softres-client";
import { validateApiToken } from "~/server/api/v1-auth";
import { fetchEventDetail } from "~/server/services/raid-helper-client";
import { findEventsForZone } from "~/server/services/softres-event-lookup";
import {
  getZoneEmojiMap,
  hasSrPostForEvent,
  isTokenThreadUsable,
  postChannelEmbed,
  upsertWeeklyTokenBlock,
} from "~/server/services/softres-discord-service";

// Keep in sync with create-softres's request schema (packages/contracts) and RAID_ZONE_CONFIG.
const RequestSchema = z
  .object({
    zone: z.enum(["onyxia", "mc", "bwl", "zg", "aq20", "aq40", "naxxramas"]),
    /** Raid Helper event (signup message) id — the SR takes that raid's time, title and link. */
    eventId: z
      .string()
      .regex(/^\d{17,20}$/, "Invalid Raid Helper event ID")
      .optional(),
    /** The raid night as an Eastern-time day (`YYYY-MM-DD`): finds that day's Raid Helper event
     * for the zone itself, so the caller never has to look up an event id. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .optional(),
    /** An explicit raid time, unix seconds, for a raid with no Raid Helper event. */
    timestamp: z.number().int().positive().optional(),
    /** Where the public SR post goes. Defaults to the event's own channel. */
    channelId: z
      .string()
      .regex(/^\d{17,20}$/, "Invalid channel ID")
      .optional(),
  })
  .refine((v) => [v.eventId, v.date, v.timestamp].filter(Boolean).length <= 1, {
    message: "Give at most one of eventId, date or timestamp",
  })
  .refine((v) => v.eventId || v.date || v.channelId, {
    message: "channelId is required unless eventId or date is given",
  });

// "Server Time" (not "zzz"/EDT-EST) since Discord members read this as WoW server time.
const DATE_LABEL_FORMAT = "EEE, MMM d 'at' h:mm a 'Server Time'";

/**
 * Templar's create-SR (TEMPLE-132): the same result as the bot's `/sr` — a SoftRes raid for a
 * zone, a public post in a raid channel, and the admin link filed in the weekly Token-thread block
 * — done server-side so the two share one implementation. Reached through the Templar proxy, so
 * it runs as the requesting user: they must hold `softres:access`, exactly what `/sr` requires.
 *
 * The response never contains the admin link; it only ever goes to the Token thread. Not
 * registered in the OpenAPI spec — an additive endpoint, so the external Templar contract is
 * unchanged.
 */
export async function POST(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.SOFTRES_ACCESS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { zone: slug, date, timestamp } = parsed.data;
    let eventId = parsed.data.eventId;

    const zone = getZoneForInstance(slug);
    const instanceId = zone ? SOFTRES_CREATE_INSTANCE_IDS[zone] : undefined;
    if (!zone || instanceId === undefined) {
      return NextResponse.json({ error: "Unknown zone" }, { status: 400 });
    }

    // Resolve when/where/what-to-call-it BEFORE creating anything, so every refusal below
    // leaves no orphaned SR behind.
    let whenSec = Math.floor(Date.now() / 1000);
    let channelId = parsed.data.channelId;
    let title = `SRs : ${zone}`;
    let titleUrl: string | undefined;

    if (!eventId && date) {
      const matches = await findEventsForZone(zone, date);
      if (matches.length === 0) {
        return NextResponse.json(
          { error: `No Raid Helper event names ${zone} on ${date}. Give a timestamp instead.` },
          { status: 404 },
        );
      }
      if (matches.length > 1) {
        return NextResponse.json(
          {
            error: `More than one ${zone} raid is scheduled on ${date}. Say which, by eventId.`,
            candidates: matches.map((m) => ({
              eventId: m.eventId,
              title: m.title,
              timestamp: m.timestamp,
            })),
          },
          { status: 409 },
        );
      }
      eventId = matches[0]!.eventId;
    }

    if (eventId) {
      const event = await fetchEventDetail(eventId).catch(() => null);
      if (!event?.channelId) {
        return NextResponse.json({ error: "Raid Helper event not found" }, { status: 404 });
      }
      const eventTitle = event.displayTitle ?? event.title ?? "Raid Signup";
      if (!parseZonesFromEventTitle(eventTitle, event.channelName).includes(zone)) {
        return NextResponse.json(
          { error: `That event ("${eventTitle}") doesn't name ${zone}. Give a timestamp instead.` },
          { status: 422 },
        );
      }
      if (event.softresId) {
        return NextResponse.json(
          { error: "That raid's Raid Helper event already has a SoftRes attached" },
          { status: 409 },
        );
      }
      whenSec = event.startTime;
      channelId ??= event.channelId;
      title = `SRs : ${eventTitle}`;
      // The signup message link — what the bot's roster-forward matches an SR post on.
      titleUrl = `https://discord.com/channels/${env.DISCORD_SERVER_ID}/${event.channelId}/${eventId}`;
    } else if (timestamp) {
      whenSec = timestamp;
    }

    if (!channelId || !env.DISCORD_RAID_SR_CHANNEL_IDS.includes(channelId)) {
      return NextResponse.json({ error: "Not a SoftRes signup channel" }, { status: 400 });
    }
    if (!(await isTokenThreadUsable())) {
      return NextResponse.json(
        { error: "The SoftRes Token thread is not configured or not reachable" },
        { status: 503 },
      );
    }
    if (titleUrl && (await hasSrPostForEvent(channelId, titleUrl))) {
      return NextResponse.json(
        { error: "That raid already has an SR post in its channel" },
        { status: 409 },
      );
    }

    const created = await createSoftResRaid(instanceId);
    const emoji = (await getZoneEmojiMap()).get(zone);

    // Token first: without it the SR can't be managed, so don't announce an SR nobody can
    // administer. One retry for a transient Discord error.
    const entry = { zone, url: created.adminUrl, emoji, timestampSec: whenSec };
    try {
      await upsertWeeklyTokenBlock([entry]).catch(() => upsertWeeklyTokenBlock([entry]));
    } catch (error) {
      // Log the raid id only — never the admin link.
      logger.error(
        { raidId: created.raidId, error: error instanceof Error ? error.message : String(error) },
        "SR created but its admin token could not be saved to the Token thread",
      );
      return NextResponse.json(
        {
          error:
            "The SR was created but its admin token could not be saved, so I did not announce it. Create a new one.",
        },
        { status: 502 },
      );
    }

    const dateLabel = formatEasternDateTime(new Date(whenSec * 1000), DATE_LABEL_FORMAT);
    let messageId: string;
    try {
      messageId = await postChannelEmbed(
        channelId,
        buildPublicSoftresEmbedData({
          title,
          titleUrl,
          dateLabel,
          links: [{ zone, url: created.publicUrl, emoji }],
        }),
      );
    } catch (error) {
      logger.error(
        { raidId: created.raidId, error: error instanceof Error ? error.message : String(error) },
        "SR created and token saved, but the public post failed",
      );
      return NextResponse.json(
        {
          error: "The SR was created and its token saved, but posting it to the channel failed",
          publicUrl: created.publicUrl,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      zone,
      publicUrl: created.publicUrl,
      channelId,
      messageId,
      timestamp: whenSec,
      dateLabel,
      eventId: eventId ?? null,
    });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
