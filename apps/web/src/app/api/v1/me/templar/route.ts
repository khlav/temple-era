import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "~/lib/logger";

const PatchSchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager && !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const [u] = await db
      .update(users)
      .set({ templarEnabled: parsed.data.enabled })
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        name: users.name,
        image: users.image,
        isRaidManager: users.isRaidManager,
        isAdmin: users.isAdmin,
        templarEnabled: users.templarEnabled,
      });

    if (!u) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: u.id,
      name: u.name,
      image: u.image,
      isRaidManager: u.isRaidManager,
      isAdmin: u.isAdmin,
      templarEnabled: u.templarEnabled ?? false,
    });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
