import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { PatchRaidSchema } from "~/lib/openapi-registry";
import { db } from "~/server/db";
import {
  raids,
  raidLogs,
  raidBenchMap,
  raidLogAttendeeMap,
  characters,
  users,
} from "~/server/db/schema";
import { aliasedTable, eq, inArray } from "drizzle-orm";

function parseRaidId(id: string) {
  const raidId = parseInt(id, 10);
  return isNaN(raidId) ? null : raidId;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const raidId = parseRaidId(id);
    if (raidId === null) {
      return NextResponse.json({ error: "Invalid raid ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const includeParam = url.searchParams.get("include");
    const includeAttendees = (includeParam ?? "")
      .split(",")
      .map((s) => s.trim())
      .includes("attendees");

    const raidResult = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        date: raids.date,
        zone: raids.zone,
        attendanceWeight: raids.attendanceWeight,
        creator: {
          name: users.name,
          image: users.image,
        },
      })
      .from(raids)
      .leftJoin(users, eq(users.id, raids.createdById))
      .where(eq(raids.raidId, raidId))
      .limit(1);

    if (raidResult.length === 0) {
      return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    }

    const raidRow = raidResult[0]!;

    const raidLogsResult = await db
      .select({
        raidLogId: raidLogs.raidLogId,
        name: raidLogs.name,
        kills: raidLogs.kills,
        startTimeUTC: raidLogs.startTimeUTC,
        endTimeUTC: raidLogs.endTimeUTC,
      })
      .from(raidLogs)
      .where(eq(raidLogs.raidId, raidId));

    const benchResult = await db.query.raidBenchMap.findMany({
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

    let attendees:
      | {
          characterId: number;
          name: string;
          class: string;
          classDetail: string;
          server: string;
          slug: string;
        }[]
      | undefined;

    if (includeAttendees) {
      const raidLogIds = raidLogsResult.map((r) => r.raidLogId);
      if (raidLogIds.length > 0) {
        const primaryCharacters = aliasedTable(characters, "primary_character");
        attendees = await db
          .selectDistinct({
            characterId: characters.characterId,
            name: characters.name,
            class: characters.class,
            classDetail: characters.classDetail,
            server: characters.server,
            slug: characters.slug,
          })
          .from(raidLogAttendeeMap)
          .innerJoin(characters, eq(characters.characterId, raidLogAttendeeMap.characterId))
          .leftJoin(
            primaryCharacters,
            eq(characters.primaryCharacterId, primaryCharacters.characterId),
          )
          .where(inArray(raidLogAttendeeMap.raidLogId, raidLogIds));
      } else {
        attendees = [];
      }
    }

    return NextResponse.json({
      raidId: raidRow.raidId,
      name: raidRow.name,
      date: raidRow.date,
      zone: raidRow.zone,
      attendanceWeight: raidRow.attendanceWeight,
      creator: raidRow.creator,
      logs: raidLogsResult.map((l) => ({
        raidLogId: l.raidLogId,
        name: l.name,
        kills: l.kills,
        startTimeUTC: l.startTimeUTC?.toISOString() ?? null,
        endTimeUTC: l.endTimeUTC?.toISOString() ?? null,
      })),
      bench: benchResult.map((b) => b.character),
      ...(includeAttendees && { attendees }),
    });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const raidId = parseRaidId(id);
    if (raidId === null) {
      return NextResponse.json({ error: "Invalid raid ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchRaidSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;
    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: "No fields provided" }, { status: 400 });
    }

    const { raidLogIds, ...raidFields } = input;

    const result = await db.transaction(async (tx) => {
      const updated =
        Object.keys(raidFields).length > 0
          ? await tx
              .update(raids)
              .set({ ...raidFields, updatedById: user.id })
              .where(eq(raids.raidId, raidId))
              .returning({
                raidId: raids.raidId,
                name: raids.name,
                date: raids.date,
                zone: raids.zone,
                attendanceWeight: raids.attendanceWeight,
              })
          : await tx
              .select({
                raidId: raids.raidId,
                name: raids.name,
                date: raids.date,
                zone: raids.zone,
                attendanceWeight: raids.attendanceWeight,
              })
              .from(raids)
              .where(eq(raids.raidId, raidId))
              .limit(1);

      if (updated.length === 0) return null;

      if (raidLogIds !== undefined) {
        // Detach any logs currently pointed at this raid but not in the new set
        await tx.update(raidLogs).set({ raidId: null }).where(eq(raidLogs.raidId, raidId));

        if (raidLogIds.length > 0) {
          await tx.update(raidLogs).set({ raidId }).where(inArray(raidLogs.raidLogId, raidLogIds));
        }
      }

      return updated[0]!;
    });

    if (!result) {
      return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const raidId = parseRaidId(id);
    if (raidId === null) {
      return NextResponse.json({ error: "Invalid raid ID" }, { status: 400 });
    }

    const result = await db
      .delete(raids)
      .where(eq(raids.raidId, raidId))
      .returning({ raidId: raids.raidId });

    if (result.length === 0) {
      return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
