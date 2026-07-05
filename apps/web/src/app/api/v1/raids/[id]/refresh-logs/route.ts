import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raids, raidLogs, characters, raidLogAttendeeMap } from "~/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { RaidReportQuery } from "~/server/api/wcl-queries";
import { GetWCLGraphQLQuery, RaidReportDataShaper, Slugify } from "~/server/api/wcl-helpers";
import type { RawRaidReportRequestResult } from "~/server/api/interfaces/wcl";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const raidResult = await db
      .select({ raidId: raids.raidId })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    if (raidResult.length === 0) {
      return NextResponse.json({ error: "Raid not found" }, { status: 404 });
    }

    const raidLogRows = await db
      .select({ raidLogId: raidLogs.raidLogId })
      .from(raidLogs)
      .where(eq(raidLogs.raidId, raidId));

    if (raidLogRows.length === 0) {
      return NextResponse.json({ refreshed: [] });
    }

    const refreshed: string[] = [];

    for (const { raidLogId } of raidLogRows) {
      const rawResponse = await GetWCLGraphQLQuery(RaidReportQuery, { reportID: raidLogId });
      const wclLog = RaidReportDataShaper((await rawResponse.json()) as RawRaidReportRequestResult);

      await db
        .insert(raidLogs)
        .values({
          raidLogId: wclLog.raidLogId,
          name: wclLog.name,
          raidId,
          kills: wclLog.kills,
          zone: wclLog.zone,
          startTimeUTC: wclLog.startTimeUTC,
          endTimeUTC: wclLog.endTimeUTC,
          createdById: user.id,
        })
        .onConflictDoUpdate({
          target: [raidLogs.raidLogId],
          set: {
            name: wclLog.name,
            kills: wclLog.kills,
            zone: wclLog.zone,
            startTimeUTC: wclLog.startTimeUTC,
            endTimeUTC: wclLog.endTimeUTC,
          },
        });

      for (const participant of Object.values(wclLog.participants)) {
        await db
          .insert(characters)
          .values({
            characterId: participant.characterId,
            name: participant.name,
            class: participant.class,
            classDetail: participant.classDetail,
            server: participant.server,
            createdById: user.id,
            slug: Slugify(
              [participant.name, participant.server, participant.characterId.toString()].join("-"),
            ),
          })
          .onConflictDoUpdate({
            target: [characters.characterId],
            set: {
              name: participant.name,
              class: participant.class,
              classDetail: sql`CASE
                WHEN ${participant.classDetail} != ${participant.class} THEN ${participant.classDetail}
                ELSE COALESCE(${characters.classDetail}, ${participant.classDetail})
              END`,
              server: participant.server,
            },
          });
      }

      await db.delete(raidLogAttendeeMap).where(eq(raidLogAttendeeMap.raidLogId, raidLogId));

      const participantValues = Object.values(wclLog.participants);
      if (participantValues.length > 0) {
        await db.insert(raidLogAttendeeMap).values(
          participantValues.map((participant) => ({
            raidLogId,
            characterId: participant.characterId,
            createdById: user.id,
          })),
        );
      }

      refreshed.push(raidLogId);
    }

    return NextResponse.json({ refreshed });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
