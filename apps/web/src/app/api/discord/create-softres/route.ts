import { NextResponse } from "next/server";
import {
  CreateSoftresRequestSchema,
  firstIssueMessage,
  type CreateSoftresResult,
} from "@temple-era/contracts";
import { logger } from "~/lib/logger";
import { env } from "~/env.js";
import { compressResponse } from "~/lib/compression";
import { getZoneForInstance } from "~/lib/raid-zones";
import { SOFTRES_CREATE_INSTANCE_IDS } from "~/lib/softres-create-instance-ids";
import { createSoftResRaid } from "~/server/api/softres-client";
import { formatEasternDateTime } from "~/lib/raid-formatting";

/**
 * Manual escape hatch for `/sr` (TEMPLE-123): creates a SoftRes SR for a given zone slug with
 * no Raid-Helper event to key off of. Structurally similar to `ensure-softres`, but simpler —
 * no event lookup, no doubleheader parsing, and `createdDate` is always "now" (Eastern) rather
 * than derived from an event's start time.
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
    const parsed = CreateSoftresRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      const response = await compressResponse({ error: firstIssueMessage(parsed.error) }, request);
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }

    const { zone: slug } = parsed.data;
    const zone = getZoneForInstance(slug);
    const instanceId = zone ? SOFTRES_CREATE_INSTANCE_IDS[zone] : undefined;
    if (!zone || instanceId === undefined) {
      // Exhaustive by construction given the request schema's enum, but guard anyway —
      // noUncheckedIndexedAccess and the enum/RAID_ZONE_CONFIG sync are two separate sources of truth.
      logger.error({ slug }, "Unknown zone slug in create-softres request");
      const result: CreateSoftresResult = { success: false, error: "Unknown zone" };
      return await compressResponse(result, request);
    }

    const created = await createSoftResRaid(instanceId);
    const createdDate = formatEasternDateTime(new Date(), "EEEE MM/dd/yyyy");

    const result: CreateSoftresResult = {
      success: true,
      zone,
      adminUrl: created.adminUrl,
      createdDate,
    };
    return await compressResponse(result, request);
  } catch (error) {
    logger.error({ err: error }, "Error in create-softres");
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
