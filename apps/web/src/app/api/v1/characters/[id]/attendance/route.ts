import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  characters,
  trackedRaidsL6LockoutWk,
  primaryRaidAttendeeAndBenchMap,
  primaryRaidAttendanceL6LockoutWk,
} from "~/server/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const characterId = parseInt(id, 10);
    if (isNaN(characterId)) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 },
      );
    }

    // Determine primary character ID to query attendance
    let primaryCharacterId = characterId;
    const char = await db.query.characters.findFirst({
      where: eq(characters.characterId, characterId),
      columns: { primaryCharacterId: true, name: true, isPrimary: true },
    });

    if (!char) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    // If this character has a primary, use that instead
    if (char.primaryCharacterId !== null && !char.isPrimary) {
      primaryCharacterId = char.primaryCharacterId;
    }

    const [attendanceReport, attendanceSummary] = await Promise.all([
      db
        .select({
          raidId: trackedRaidsL6LockoutWk.raidId,
          name: trackedRaidsL6LockoutWk.name,
          date: trackedRaidsL6LockoutWk.date,
          attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
          zone: trackedRaidsL6LockoutWk.zone,
          attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
        })
        .from(trackedRaidsL6LockoutWk)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          and(
            eq(
              trackedRaidsL6LockoutWk.raidId,
              primaryRaidAttendeeAndBenchMap.raidId,
            ),
            eq(
              primaryRaidAttendeeAndBenchMap.primaryCharacterId,
              primaryCharacterId,
            ),
          ),
        )
        .orderBy(trackedRaidsL6LockoutWk.date),
      db
        .select({
          weightedAttendancePct:
            primaryRaidAttendanceL6LockoutWk.weightedAttendancePct,
          weightedRaidTotal: primaryRaidAttendanceL6LockoutWk.weightedRaidTotal,
        })
        .from(primaryRaidAttendanceL6LockoutWk)
        .where(
          eq(primaryRaidAttendanceL6LockoutWk.characterId, primaryCharacterId),
        )
        .limit(1),
    ]);

    const attendancePct = attendanceSummary[0]?.weightedAttendancePct ?? 0;
    const weeksTracked = attendanceSummary[0]?.weightedRaidTotal ?? 0;

    return NextResponse.json({
      characterId,
      characterName: char.name,
      attendancePct,
      weeksTracked,
      raids: attendanceReport.map((r) => ({
        raidId: r.raidId,
        name: r.name,
        date: r.date,
        zone: r.zone,
        attendanceWeight: r.attendanceWeight,
        attendeeOrBench: r.attendeeOrBench,
      })),
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
