import {
  pgTableCreator,
  pgView,
  pgEnum,

  primaryKey,
  foreignKey,
  index,
  uniqueIndex,

  serial,
  integer,
  timestamp,
  varchar,
  text,
  boolean, pgMaterializedView,
} from "drizzle-orm/pg-core";
import {eq, relations, SQL, sql} from "drizzle-orm";
import { DefaultTimestamps, CreatedBy, UpdatedBy } from "~/server/db/helpers";
import { users } from "~/server/db/models/auth-schema";
import {isNotNull} from "drizzle-orm/sql/expressions/conditions";

// ERD
// https://dbdiagram.io/d/Temple-Raid-Attendance-ERD-676ef1de5406798ef7c860a0
//

const sourceEnumValues: [string, ...string[]] = ["ui","wcl_raid_log_import"];
export const createdViaEnum = pgEnum('created_via', sourceEnumValues);
export const updatedViaEnum = pgEnum('updated_via', sourceEnumValues);

const tableCreator = pgTableCreator((name) => name)

export const raids = tableCreator(
  "raid",
  {
    raidId: serial("raid_id").primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    date: timestamp("date").notNull(), // Date of the raids
    attendanceWeight: integer("attendance_weight").default(1).notNull(),
    ...CreatedBy,
    ...UpdatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    idIdx: uniqueIndex("raid__raid_id_idx").on(table.raidId)
  })
);

export const raidsRelations = relations(raids, ({one, many}) => ({
  raidLogs: many(raidLogs),
  // TO-DO: raidAttendeeMap: many(raidAttendeesMap) // Distincted view of raids attendees across all raids logs

  // NOTE: Does not work!!!!
  // ------------------------
  creator: one(users, {
    fields: [raids.createdById],
    references: [users.id]
  }),
}));

export const raidLogs = tableCreator(
  "raid_log",
  {
    raidLogId: varchar("raid_log_id", { length: 64 }).primaryKey(),
    raidId: integer("raid_id")
      .references(() => raids.raidId, { onDelete: 'set null'}),
    name: varchar("name", { length: 256 }).notNull(),
    kills: text("kills").array().notNull().default(sql`ARRAY[]::text[]`),
    killCount: integer("killCount").generatedAlwaysAs((): SQL => sql`cardinality(${raidLogs.kills})`),
    startTimeUTC: timestamp("start_time_utc"),
    endTimeUTC: timestamp("end_time_utc"),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    idIdx: uniqueIndex("raid_log__raid_log_id_idx").on(table.raidLogId),
  })
);

export const raidLogsRelations = relations(raidLogs, ({one, many}) => ({
  raid: one(raids),
  raidLogAttendeeMap: many(raidLogAttendeeMap),
  raidBenchMap: many(raidBenchMap),
}));

export const raidLogAttendeeMap = tableCreator(
  "raid_log_attendee_map",
  {
    raidLogId: varchar("raid_log_id", { length: 64 })
      .references(() => raidLogs.raidLogId, { onDelete: 'cascade' })
      .notNull(),
    characterId: integer("character_id")
      .references(() => characters.characterId)
      .notNull(),
    isIgnored: boolean("is_ignored").default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.raidLogId, table.characterId] }),
    raidLogIdIdx: index("raid_log_attendee_map__raid_log_id_idx").on(table.raidLogId),
    characterIdIdx: index("raid_log_attendee_map__character_id_idx").on(table.characterId),
    }),
);

export const raidLogAttendeeMapRelations = relations(raidLogAttendeeMap, ({one}) => ({
  raidLog: one(raidLogs, {
    fields: [raidLogAttendeeMap.raidLogId],
    references: [raidLogs.raidLogId]
  }),
  character: one(characters, {
    fields: [raidLogAttendeeMap.characterId],
    references: [characters.characterId]
  }),
}));

export const raidBenchMap = tableCreator(
  "raid_bench_map",
  {
    raidId: integer("raid_id")
      .references(() => raids.raidId, { onDelete: 'cascade' })
      .notNull(),
    characterId: integer("character_id").references(() => characters.characterId).notNull(),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.raidId, table.characterId] }),
    raidIdIdx: index("raid_bench_map__raid_id_idx").on(table.raidId),
    characterIdIdx: index("raid_bench_map__character_id_idx").on(table.characterId),
  })
);

export const raidBenchMapRelations = relations(raidBenchMap, ({one}) => ({
  raid: one(raidLogs, {
    fields: [raidBenchMap.raidId],
    references: [raidLogs.raidId]
  }),
  character: one(characters, {
    fields: [raidBenchMap.characterId],
    references: [characters.characterId]
  }),
}));

export const characters = tableCreator(
  "character",
  {
    characterId: integer("character_id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    server: varchar("server", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 256 }),
    class: varchar("class", { length: 128 }),
    classDetail: varchar("class_detail", { length: 256 }),
    primaryCharacterId: integer("primary_character_id"),
    isPrimary: boolean("is_primary").generatedAlwaysAs((): SQL => {
      return sql`(${characters.characterId} = COALESCE(${characters.primaryCharacterId}, 0)) OR ${characters.primaryCharacterId} IS NULL`
    }),
    isIgnored: boolean("is_ignored").default(false),
    createdVia: createdViaEnum("created_via"),
    updatedVia: updatedViaEnum("updated_via"),
    ...CreatedBy,
    ...DefaultTimestamps, // Auto-generate created_at and updated_at columns
  },
  (table) => ({
    primaryCharacterIdFK: foreignKey({
      columns: [table.primaryCharacterId],
      foreignColumns: [table.characterId],
      name: "character__primary_character_id_fk",
    }),
  })
);

export const charactersRelations = relations(characters, ({one}) => ({
  primaryCharacter: one(characters, {
    fields: [characters.primaryCharacterId],
    references: [characters.characterId],
  }),
  user: one(users, {
    fields: [characters.characterId],
    references: [users.characterId]
  })
}));

export const raidAttendeeMap = pgView(
  "raid_attendee_map",
  {
    raidId: integer("raid_id").references(() => raids.raidId),
    primaryCharacterId: integer("primary_character_id").references(() => characters.characterId),
  }
).existing();
/*
CREATE OR REPLACE VIEW public."raid_attendee_map" AS
SELECT DISTINCT
    raid_log.raid_id,
    COALESCE(raid_log_attendee_map.primary_character_id, raid_log_attendee_map.character_id)
FROM raid_log
LEFT JOIN raid_log_attendee_map
    ON raid_log.id = raid_log_attendee_map.raid_log_id;
 */

// export const raidAttendeesMapRelations = relations(raidAttendeesMap, ({one}) => ({
//   raids: one(raidLogs, {
//     fields: [raidAttendeesMap.[raidId]],
//     references: [raidLogs.[raidId]]
//   }),
//   character: one(characters, {
//     fields: [raidAttendeesMap.characterId],
//     references: [characters.characterId]
//   }),
// }));