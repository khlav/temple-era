import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { SetBenchSchema } from "~/lib/openapi-registry";
import { db } from "~/server/db";
import { raids, raidBenchMap } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const raidId = parseInt(id, 10);
    if (isNaN(raidId)) {
      return NextResponse.json({ error: "Invalid raid ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = SetBenchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const raidExists = await db
      .select({ raidId: raids.raidId })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    if (raidExists.length === 0) {
      return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    }

    const { characterIds } = parsed.data;

    const bench = await db.transaction(async (tx) => {
      await tx.delete(raidBenchMap).where(eq(raidBenchMap.raidId, raidId));

      if (characterIds.length > 0) {
        await tx.insert(raidBenchMap).values(
          characterIds.map((characterId) => ({
            raidId,
            characterId,
            createdById: user.id,
          })),
        );
      }

      return tx.query.raidBenchMap.findMany({
        where: eq(raidBenchMap.raidId, raidId),
        columns: {},
        with: {
          character: {
            columns: {
              characterId: true,
              name: true,
              class: true,
              classDetail: true,
              server: true,
              slug: true,
            },
          },
        },
      });
    });

    return NextResponse.json({
      bench: bench.map((b) => b.character),
    });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
