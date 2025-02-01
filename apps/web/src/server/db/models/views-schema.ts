import {
  pgSchema,
  integer,
  varchar,
  real,
  text,
  json,
  date,
} from "drizzle-orm/pg-core";
import {
  characters,
  raids,
  raidsColumns,
} from "~/server/db/models/raid-schema";

// Note: Views kept in a separate file to remain reference-able
//       in different contexts without causing drizzle-kit errors

//       Use custom drizzle-orm migrations to CREATE new views, then mirror them in-code here

const viewSchema = pgSchema("views");
export const primaryRaidAttendeeMap = viewSchema
  .view("primary_raid_attendee_map", {
    raidId: integer("raid_id").references(() => raids.raidId),
    primaryCharacterId: integer("primary_character_id").references(
      () => characters.characterId,
    ),
    attendingCharacterIds: integer("attending_character_ids")
      .references(() => characters.characterId)
      .array(),
  })
  .existing();

export const primaryRaidBenchMap = viewSchema
  .view("primary_raid_bench_map", {
    raidId: integer("raid_id").references(() => raids.raidId),
    primaryCharacterId: integer("primary_character_id").references(
      () => characters.characterId,
    ),
    benchCharacterIds: integer("bench_character_ids")
      .references(() => characters.characterId)
      .array(),
  })
  .existing();

export const primaryRaidAttendeeAndBenchMap = viewSchema
  .view("primary_raid_attendee_and_bench_map", {
    raidId: integer("raid_id").references(() => raids.raidId),
    primaryCharacterId: integer("primary_character_id").references(
      () => characters.characterId,
    ),
    allCharacterIds: integer("all_character_ids")
      .references(() => characters.characterId)
      .array(),
    attendeeOrBench: text("attendee_or_bench"),
    allCharacters: (json("all_characters").$type<Array<{
      name: string;
      characterId: number;
    }>>()),
    raidLogIds: text("raid_log_ids").array(),
  })
  .existing();

export const trackedRaidsL6LockoutWk = viewSchema
  .view("tracked_raids_l6lockoutwk", {
    ...raidsColumns,
    lockoutWeek: text("lockout_week").notNull()
  })
  .existing();

export const trackedRaidsCurrentLockout = viewSchema
  .view("tracked_raids_current_lockout", {
    ...raidsColumns,
  })
  .existing();

export const allRaidsCurrentLockout = viewSchema
  .view("all_raids_current_lockout", {
    ...raidsColumns,
  })
  .existing();

export const primaryRaidAttendanceL6LockoutWk = viewSchema
  .view("primary_raid_attendance_l6lockoutwk", {
    characterId: integer("character_id").references(
      () => characters.characterId,
    ),
    name: varchar("name"),
    weightedAttendance: real("weighted_attendance"),
    weightedRaidTotal: real("weighted_raid_total"),
    weightedAttendancePct: real("weighted_attendance_pct"),
    raidsAttended: json("raids_attended_json").$type<{
      name: string;
      zone: string;
      date: Date;
      attendanceWeight: number;
      attendeeOrBench: string;
    }>(),
  })
  .existing();

export const reportDates = viewSchema
  .view("report_dates", {
    reportPeriodStart: date("report_period_start"),
    reportPeriodEnd: date("report_period_end"),
  })
  .existing();
