import { NextResponse } from "next/server";
import {
  ResolveSoftresEventRequestSchema,
  firstIssueMessage,
  type ResolveSoftresEventResult,
} from "@temple-era/contracts";
import { logger } from "~/lib/logger";
import { env } from "~/env.js";
import { compressResponse } from "~/lib/compression";
import { getZoneForInstance } from "~/lib/raid-zones";
import { fetchSoftResRaidData } from "~/server/api/softres-client";
import { findEventsForZone } from "~/server/services/softres-event-lookup";

/**
 * SoftRes knows a raid's zone but not when it is. Given a softres.it raid id, returns that zone
 * plus the upcoming Raid Helper events naming it — the only place the raid night's date and time
 * exist. The bot uses it to offer adding a raid lead's hand-posted admin link to the weekly
 * token block; Templar reuses it to match a new SR to a scheduled raid.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!env.TEMPLE_WEB_API_TOKEN) {
      logger.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      const response = await compressResponse({ error: "Server configuration error" }, request);
      return new NextResponse(response.body, { status: 500, headers: response.headers });
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      logger.error(
        {
          ip: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
          timestamp: new Date().toISOString(),
        },
        "Unauthorized API access attempt",
      );
      const response = await compressResponse({ error: "Unauthorized" }, request);
      return new NextResponse(response.body, { status: 401, headers: response.headers });
    }

    const parsed = ResolveSoftresEventRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      const response = await compressResponse({ error: firstIssueMessage(parsed.error) }, request);
      return new NextResponse(response.body, { status: 400, headers: response.headers });
    }
    const { raidId, dateHint } = parsed.data;

    let softres: Awaited<ReturnType<typeof fetchSoftResRaidData>>;
    try {
      softres = await fetchSoftResRaidData(raidId);
    } catch (error) {
      // A raid id that softres.it doesn't know (or an outage) is an expected outcome for a
      // hand-pasted link, not a server fault.
      logger.warn(
        { raidId, error: error instanceof Error ? error.message : String(error) },
        "Could not read SoftRes raid for resolve-softres-event",
      );
      const result: ResolveSoftresEventResult = {
        success: false,
        error: "Could not read that SoftRes raid",
      };
      return await compressResponse(result, request);
    }

    const zone = softres.instance ? getZoneForInstance(softres.instance) : undefined;
    if (!zone) {
      const result: ResolveSoftresEventResult = { success: true, zone: null, candidates: [] };
      return await compressResponse(result, request);
    }

    // A raid linked through Raid Helper carries its own date, matching the event to the minute —
    // authoritative, so there is nothing to search for. Every other SR has none.
    if (softres.raidTimestamp != null) {
      const result: ResolveSoftresEventResult = {
        success: true,
        zone,
        candidates: [
          { eventId: null, title: zone, source: "softres", timestamp: softres.raidTimestamp },
        ],
      };
      return await compressResponse(result, request);
    }

    const candidates = (await findEventsForZone(zone, dateHint)).map((m) => ({
      eventId: m.eventId,
      title: m.title,
      source: "raid-helper" as const,
      timestamp: m.timestamp,
    }));

    const result: ResolveSoftresEventResult = { success: true, zone, candidates };
    return await compressResponse(result, request);
  } catch (error) {
    logger.error({ err: error }, "Error in resolve-softres-event");
    const response = await compressResponse(
      { success: false, error: "Internal server error" },
      request,
    );
    return new NextResponse(response.body, { status: 500, headers: response.headers });
  }
}
