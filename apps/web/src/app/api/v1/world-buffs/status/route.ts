import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { SCOPE } from "~/lib/scopes";
import { WORLD_BUFF_ITEMS } from "~/lib/world-buffs";
import { getMatrix, submitAvailability } from "~/server/services/world-buff-service";
import { serializeStatus } from "./_helpers";

const SubmitAvailabilitySchema = z.object({
  characterName: z.string().trim().min(1).max(128),
  characterId: z.number().int().positive().optional(),
  item: z.enum(WORLD_BUFF_ITEMS),
  queueType: z.enum(["main", "alt", "backup"]).default("main"),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const rows = await getMatrix();
    return NextResponse.json(rows.map(serializeStatus));
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Create-or-update (upsert) on (characterName, item) — the API equivalent of the site's
// self-service submission form. Gated behind worldbuff:manage, unlike the web form (any
// logged-in user can submit for themselves there): this path is for bulk/bot imports on
// someone else's behalf, which needs the same permission level as scheduling.
//
// Unlike the tRPC procedure this wraps, queueType defaults to "main" rather than staying
// undefined — so a resubmission that omits it resets queueType to main instead of preserving
// whatever was there before. Deliberate: for a bulk import, "no queue-type column in the sheet"
// should mean main, not "leave it alone."
export async function POST(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.WORLDBUFF_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = SubmitAvailabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await submitAvailability({ ...parsed.data, actingUserId: user.id });
    return NextResponse.json(serializeStatus(result));
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
