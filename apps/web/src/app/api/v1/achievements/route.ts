import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { CreateAchievementSchema } from "~/lib/openapi-registry";
import { SCOPE } from "~/lib/scopes";
import { AchievementServiceError, createAchievement } from "~/server/services/achievement-service";

// Creates a custom (manual-grant) achievement — the REST equivalent of the admin panel's "New
// Achievement" form. Always hidden and always exactly one tier, same invariants createAchievement
// enforces for the tRPC path. Grant it to a family via POST /api/v1/achievements/{id}/grant.
export async function POST(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.ACHIEVEMENT_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreateAchievementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await createAchievement(parsed.data, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AchievementServiceError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "INVALID" ? 400 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
