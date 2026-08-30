import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { GrantCustomAchievementSchema } from "~/lib/openapi-registry";
import { SCOPE } from "~/lib/scopes";
import {
  AchievementServiceError,
  grantCustomAchievement,
} from "~/server/services/achievement-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grants an existing custom achievement to a family by achievementId — the tier is resolved
// automatically (see grantCustomAchievement's own doc comment for why that's safe only for
// custom achievements). Repeatable across families over time; each grant is its own award row.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.ACHIEVEMENT_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid achievement ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = GrantCustomAchievementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await grantCustomAchievement(
      { achievementId: id, primaryCharacterId: parsed.data.primaryCharacterId },
      user.id,
    );
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
