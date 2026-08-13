import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { SCOPE } from "~/lib/scopes";
import {
  WorldBuffServiceError,
  createAssignment,
  getAssignmentById,
  listActiveAssignments,
  listPastAssignments,
} from "~/server/services/world-buff-service";
import { serializeAssignment } from "./_helpers";

const CreateAssignmentSchema = z.object({
  statusId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  notes: z.string().max(2000).nullable().optional(),
});

// Mirrors the tRPC router's own auth boundary: listing active assignments is public (any valid
// token, same as `listActiveAssignments` being a `publicProcedure`), while completed turn-ins
// require worldbuff:manage (same as `listPastAssignments` being scope-gated).
export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "active";
    if (state !== "active" && state !== "past") {
      return NextResponse.json(
        { error: "Invalid state — must be 'active' or 'past'" },
        { status: 400 },
      );
    }

    if (state === "past" && !user.scopes.includes(SCOPE.WORLDBUFF_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = state === "active" ? await listActiveAssignments() : await listPastAssignments();
    return NextResponse.json(rows.map(serializeAssignment));
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    const parsed = CreateAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const created = await createAssignment({ ...parsed.data, actingUserId: user.id });
    const enriched = await getAssignmentById(created.id);
    return NextResponse.json(serializeAssignment(enriched), { status: 201 });
  } catch (error) {
    if (error instanceof WorldBuffServiceError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
