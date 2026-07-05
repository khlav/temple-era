import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { CreateRaidSchema } from "~/lib/openapi-registry";
import { db } from "~/server/db";
import { raids, raidLogs, raidBenchMap } from "~/server/db/schema";
import { desc, eq, gte, lte, gt, and, inArray, type SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const zone = searchParams.get("zone") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const scoredParam = searchParams.get("scored");
    const rawLimit = Number(searchParams.get("limit") ?? "50");
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 50 : rawLimit));
    const rawOffset = Number(searchParams.get("offset") ?? "0");
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const whereConditions: SQL[] = [];
    if (zone) whereConditions.push(eq(raids.zone, zone));
    if (from) whereConditions.push(gte(raids.date, from));
    if (to) whereConditions.push(lte(raids.date, to));
    if (scoredParam === "true") whereConditions.push(gt(raids.attendanceWeight, 0));

    const result = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        date: raids.date,
        zone: raids.zone,
        attendanceWeight: raids.attendanceWeight,
      })
      .from(raids)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(raids.date))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(result);
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

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreateRaidSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(raids)
        .values({
          name: input.name,
          date: input.date,
          zone: input.zone,
          attendanceWeight: input.attendanceWeight,
          createdById: user.id,
          updatedById: user.id,
        })
        .returning({
          raidId: raids.raidId,
          name: raids.name,
          date: raids.date,
          zone: raids.zone,
          attendanceWeight: raids.attendanceWeight,
        });

      const newRaid = inserted[0]!;

      if (input.raidLogIds.length > 0) {
        await tx
          .update(raidLogs)
          .set({ raidId: newRaid.raidId })
          .where(inArray(raidLogs.raidLogId, input.raidLogIds));
      }

      if (input.bench.length > 0) {
        await tx.insert(raidBenchMap).values(
          input.bench.map((characterId) => ({
            raidId: newRaid.raidId,
            characterId,
            createdById: user.id,
          })),
        );
      }

      return newRaid;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
