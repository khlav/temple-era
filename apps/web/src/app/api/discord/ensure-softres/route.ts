import { NextResponse } from "next/server";
import {
  EnsureSoftresRequestSchema,
  firstIssueMessage,
  type EnsureSoftresResult,
} from "@temple-era/contracts";
import { logger } from "~/lib/logger";
import { env } from "~/env.js";
import { compressResponse } from "~/lib/compression";
import { fetchEventDetail } from "~/server/services/raid-helper-client";
import { parseZonesFromEventTitle } from "~/lib/softres-doubleheader-parser";
import { SOFTRES_CREATE_INSTANCE_IDS } from "~/lib/softres-create-instance-ids";
import { createSoftResRaid } from "~/server/api/softres-client";
import { formatEasternDateTime } from "~/lib/raid-formatting";

/**
 * Given a Raid-Helper `eventId`, ensures the event has a SoftRes soft-reserve raid: no-ops if
 * `softresId` is already set, otherwise identifies the zone(s) raided from the event's title (a
 * doubleheader event names two) and creates exactly one SoftRes SR per zone. Inert until Phase 2
 * (apps/bot) starts calling it — this route needs no database access, unlike `create-raid`.
 */
export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    if (!env.TEMPLE_WEB_API_TOKEN) {
      logger.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      const response = await compressResponse({ error: "Server configuration error" }, request);
      return new NextResponse(response.body, {
        status: 500,
        headers: response.headers,
      });
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
      return new NextResponse(response.body, {
        status: 401,
        headers: response.headers,
      });
    }

    // 2. Validate request body
    const parsed = EnsureSoftresRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      const response = await compressResponse({ error: firstIssueMessage(parsed.error) }, request);
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }
    const { eventId } = parsed.data;

    // 3. Fetch event detail and check whether a SoftRes raid already exists
    const event = await fetchEventDetail(eventId);

    if (event.softresId) {
      const result: EnsureSoftresResult = { success: true, created: false, links: [] };
      return await compressResponse(result, request);
    }

    // 4. Identify zone(s) raided from the event's title/channel name
    const zones = parseZonesFromEventTitle(event.displayTitle ?? event.title, event.channelName);
    if (zones.length === 0) {
      logger.warn(
        { eventId, title: event.title },
        "Could not identify any zone for ensure-softres",
      );
      const result: EnsureSoftresResult = { success: true, created: false, links: [] };
      return await compressResponse(result, request);
    }

    // 5. Create exactly one SR per zone, sequentially — each call re-establishes its own
    // anonymous session, so running them concurrently risks cookie/session cross-talk against
    // the same undocumented endpoint.
    const eventDate = formatEasternDateTime(new Date(event.startTime * 1000), "EEEE MM/dd/yyyy");
    const links: Array<{ zone: string; instanceId: number; adminUrl: string; eventDate: string }> =
      [];
    for (const zone of zones) {
      const instanceId = SOFTRES_CREATE_INSTANCE_IDS[zone];
      if (instanceId === undefined) {
        // Exhaustive by construction — every RaidZone has an entry in SOFTRES_CREATE_INSTANCE_IDS
        // — but noUncheckedIndexedAccess still types the lookup as possibly undefined.
        logger.warn({ eventId, zone }, "No SoftRes create instance id known for zone");
        continue;
      }
      const created = await createSoftResRaid(instanceId);
      links.push({ zone, instanceId, adminUrl: created.adminUrl, eventDate });
    }

    const result: EnsureSoftresResult = { success: true, created: true, links };
    return await compressResponse(result, request);
  } catch (error) {
    logger.error({ err: error }, "Error in ensure-softres");
    const response = await compressResponse(
      { success: false, error: "Internal server error" },
      request,
    );
    return new NextResponse(response.body, {
      status: 500,
      headers: response.headers,
    });
  }
}
