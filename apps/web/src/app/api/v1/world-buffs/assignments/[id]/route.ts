import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { SCOPE } from "~/lib/scopes";
import {
  WorldBuffServiceError,
  deleteAssignment,
  getAssignmentById,
  updateAssignment,
} from "~/server/services/world-buff-service";
import { UUID_RE, serializeAssignment } from "../_helpers";

const UpdateAssignmentSchema = z.object({
  statusId: z.string().uuid().optional(),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.WORLDBUFF_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid assignment ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpdateAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await updateAssignment({ assignmentId: id, ...parsed.data, actingUserId: user.id });
    const enriched = await getAssignmentById(id);
    return NextResponse.json(serializeAssignment(enriched));
  } catch (error) {
    if (error instanceof WorldBuffServiceError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.WORLDBUFF_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid assignment ID" }, { status: 400 });
    }

    await deleteAssignment({ assignmentId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof WorldBuffServiceError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
