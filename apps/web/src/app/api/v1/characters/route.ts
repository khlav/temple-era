import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters, raidLogAttendeeMap, raidLogs, raids } from "~/server/db/schema";
import { eq, and, not, ilike, aliasedTable, inArray, sql, type SQL } from "drizzle-orm";

const SORTABLE_FIELDS = ["name", "firstRaidAt", "lastRaidAt"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const type = searchParams.get("type") ?? "all";
    const classesParam = searchParams.get("classes") ?? "";
    const sortByParam = searchParams.get("sortBy") ?? "name";
    const orderParam = searchParams.get("order") ?? "asc";

    const sortBy: SortableField = SORTABLE_FIELDS.includes(sortByParam as SortableField)
      ? (sortByParam as SortableField)
      : "name";
    const order: "asc" | "desc" = orderParam === "desc" ? "desc" : "asc";

    const primaryCharacters = aliasedTable(characters, "primary_character");

    // Per-character earliest/latest attended raid date, computed once and left-joined
    // so listing stays a single query regardless of result size.
    const attendanceStats = db
      .select({
        characterId: raidLogAttendeeMap.characterId,
        firstRaidAt: sql<string>`min(${raids.date})`.as("first_raid_at"),
        lastRaidAt: sql<string>`max(${raids.date})`.as("last_raid_at"),
      })
      .from(raidLogAttendeeMap)
      .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
      .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
      .where(eq(raidLogAttendeeMap.isIgnored, false))
      .groupBy(raidLogAttendeeMap.characterId)
      .as("attendance_stats");

    const whereConditions: SQL[] = [];

    if (q) {
      whereConditions.push(ilike(characters.name, `%${q}%`));
    }

    if (type === "primary") {
      whereConditions.push(eq(characters.isPrimary, true));
    } else if (type === "secondary") {
      whereConditions.push(not(eq(characters.isPrimary, true)));
    }

    if (classesParam) {
      const classes = classesParam
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      if (classes.length > 0) {
        whereConditions.push(inArray(sql`lower(${characters.class})`, classes));
      }
    }

    // Always exclude ignored characters
    whereConditions.push(eq(characters.isIgnored, false));

    const orderColumn =
      sortBy === "firstRaidAt"
        ? attendanceStats.firstRaidAt
        : sortBy === "lastRaidAt"
          ? attendanceStats.lastRaidAt
          : characters.name;

    const result = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        classDetail: characters.classDetail,
        server: characters.server,
        slug: characters.slug,
        isPrimary: characters.isPrimary,
        primaryCharacterId: characters.primaryCharacterId,
        primaryCharacterName: primaryCharacters.name,
        firstRaidAt: attendanceStats.firstRaidAt,
        lastRaidAt: attendanceStats.lastRaidAt,
      })
      .from(characters)
      .leftJoin(primaryCharacters, eq(characters.primaryCharacterId, primaryCharacters.characterId))
      .leftJoin(attendanceStats, eq(characters.characterId, attendanceStats.characterId))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(
        order === "desc" ? sql`${orderColumn} DESC NULLS LAST` : sql`${orderColumn} ASC NULLS LAST`,
      )
      .limit(200);

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
