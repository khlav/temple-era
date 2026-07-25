// src/server/api/v2/helpers/attendance.ts
import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { type db as dbType } from "~/server/db";
import { raids, raidLogs, raidLogAttendeeMap, raidBenchMap } from "~/server/db/schema";
import type { RaidAttendanceData } from "../types/attendance-types";
import { GQL_ZONE_TO_DB } from "../types/enums";
import { getEasternNow } from "~/lib/raid-formatting";
import { getTuesdayAnchoredWeekStart } from "./lockout-weeks";

export type AttendanceArgs = {
  /** All character IDs treated as a single logical attendee — primary + all secondaries unified. */
  characterIds: number[];
  zones?: string[] | null; // GQL enum values e.g. ["NAXXRAMAS"]
  /** ISO date string "YYYY-MM-DD", inclusive lower bound. Defaults to 6 lockout weeks back. */
  from?: string | null;
  /** ISO date string "YYYY-MM-DD", inclusive upper bound. Defaults to today. */
  to?: string | null;
  db: typeof dbType;
};

function defaultFrom(): string {
  const now = getEasternNow();
  const currentWeekStart = getTuesdayAnchoredWeekStart(now);
  const sixWeeksBack = new Date(currentWeekStart);
  sixWeeksBack.setUTCDate(sixWeeksBack.getUTCDate() - 6 * 7);
  return sixWeeksBack.toISOString().split("T")[0]!;
}

function defaultTo(): string {
  return getEasternNow().toISOString().split("T")[0]!;
}

export async function computeAttendance(args: AttendanceArgs): Promise<RaidAttendanceData[]> {
  const { characterIds, zones, db } = args;

  if (characterIds.length === 0) return [];

  const fromStr = args.from ?? defaultFrom();
  const toStr = args.to ?? defaultTo();

  const dbZones =
    zones && zones.length > 0
      ? zones.map((z) => GQL_ZONE_TO_DB[z]).filter((z): z is string => !!z)
      : null;

  const raidsInRange = await db
    .select()
    .from(raids)
    .where(
      and(
        gte(raids.date, fromStr),
        lte(raids.date, toStr),
        dbZones && dbZones.length > 0 ? inArray(raids.zone, dbZones) : undefined,
      ),
    )
    .orderBy(raids.date);

  if (raidsInRange.length === 0) return [];

  const raidIds = raidsInRange.map((r) => r.raidId);

  const [attendeeRows, benchRows] = await Promise.all([
    db
      .selectDistinct({ raidId: raidLogs.raidId })
      .from(raidLogAttendeeMap)
      .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
      .where(
        and(
          isNotNull(raidLogs.raidId),
          inArray(raidLogs.raidId, raidIds),
          inArray(raidLogAttendeeMap.characterId, characterIds),
          eq(raidLogAttendeeMap.isIgnored, false),
        ),
      ),
    db
      .select({ raidId: raidBenchMap.raidId })
      .from(raidBenchMap)
      .where(
        and(inArray(raidBenchMap.raidId, raidIds), inArray(raidBenchMap.characterId, characterIds)),
      ),
  ]);

  const attendedRaidIds = new Set(
    attendeeRows.map((r) => r.raidId).filter((id): id is number => id !== null),
  );
  const benchRaidIds = new Set(benchRows.map((r) => r.raidId));

  return raidsInRange.map((raid) => ({
    raid,
    status: attendedRaidIds.has(raid.raidId)
      ? "ATTENDED"
      : benchRaidIds.has(raid.raidId)
        ? "BENCH"
        : "ABSENT",
  }));
}

export type AttendedCountArgs = Omit<AttendanceArgs, "from" | "to"> & {
  from?: string | null;
  to?: string | null;
  includeBench: boolean;
};

/** Count of raids where the family was present (ATTENDED, optionally + BENCH) within range. */
export async function computeAttendedCount(args: AttendedCountArgs): Promise<number> {
  const records = await computeAttendance(args);
  return records.filter(
    (r) => r.status === "ATTENDED" || (args.includeBench && r.status === "BENCH"),
  ).length;
}

export type EarliestAttendanceArgs = {
  characterIds: number[];
  zones?: string[] | null;
  /** ISO date string "YYYY-MM-DD", inclusive lower bound. No default — searches full history. */
  from?: string | null;
  /** ISO date string "YYYY-MM-DD", inclusive upper bound. No default — searches full history. */
  to?: string | null;
  db: typeof dbType;
};

/**
 * Finds the single earliest raid the family attended, without loading the full
 * attendance history — a targeted MIN query instead of scanning every raid in range.
 */
export async function computeEarliestAttendance(
  args: EarliestAttendanceArgs,
): Promise<RaidAttendanceData | null> {
  const { characterIds, zones, from, to, db } = args;
  if (characterIds.length === 0) return null;

  const dbZones =
    zones && zones.length > 0
      ? zones.map((z) => GQL_ZONE_TO_DB[z]).filter((z): z is string => !!z)
      : null;

  const rows = await db
    .selectDistinct({ raid: raids })
    .from(raidLogAttendeeMap)
    .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
    .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
    .where(
      and(
        inArray(raidLogAttendeeMap.characterId, characterIds),
        eq(raidLogAttendeeMap.isIgnored, false),
        from ? gte(raids.date, from) : undefined,
        to ? lte(raids.date, to) : undefined,
        dbZones && dbZones.length > 0 ? inArray(raids.zone, dbZones) : undefined,
      ),
    )
    .orderBy(asc(raids.date))
    .limit(1);

  const raid = rows[0]?.raid;
  return raid ? { raid, status: "ATTENDED" } : null;
}
