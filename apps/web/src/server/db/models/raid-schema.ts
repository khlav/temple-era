import {
  pgTableCreator,
  pgEnum,
  primaryKey,
  foreignKey,
  index,
  uniqueIndex,
  serial,
  integer,
  date,
  timestamp,
  varchar,
  text,
  boolean,
  pgSchema,
  decimal,
  real,
} from "drizzle-orm/pg-core";
import { eq, relations, SQL, sql } from "drizzle-orm";
import { DefaultTimestamps, CreatedBy, UpdatedBy } from "~/server/db/helpers";
import { users } from "~/server/db/models/auth-schema";
import { isNotNull } from "drizzle-orm/sql/expressions/conditions";

// ERD
// https://dbdiagram.io/d/Temple-Raid-Attendance-ERD-676ef1de5406798ef7c860a0
//

const sourceEnumValues: [string, ...string[]] = ["ui", "wcl_raid_log_import"];
export const createdViaEnum = pgEnum("created_via", sourceEnumValues);
export const updatedViaEnum = pgEnum("updated_via", sourceEnumValues);

const tableCreator = pgTableCreator((name) => name);

export const raidsColumns = {
  raidId: serial("raid_id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  date: date("date").notNull(), // Date of the raids
  attendanceWeight: real("attendance_weight").default(1).notNull(),
  zone: varchar("zone").notNull(),
  ...CreatedBy,
  ...UpdatedBy,
  ...DefaultTimestamps,
};

export const raids = tableCreator(
  "raid",
  {
    ...raidsColumns,
  },
  (table) => ({
    idIdx: uniqueIndex("raid__raid_id_idx").on(table.raidId),
  }),
);

export const raidsRelations = relations(raids, ({ one, many }) => ({
  raidLogs: many(raidLogs),
  creator: one(users, {
    fields: [raids.createdById],
    references: [users.id],
  }),
}));

export const raidLogs = tableCreator(
  "raid_log",
  {
    raidLogId: varchar("raid_log_id", { length: 64 }).primaryKey(),
    raidId: integer("raid_id").references(() => raids.raidId, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 256 }).notNull(),
    zone: varchar("zone"),
    kills: text("kills")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    killCount: integer("killCount").generatedAlwaysAs(
      (): SQL => sql`cardinality
          (${raidLogs.kills})`,
    ),
    startTimeUTC: timestamp("start_time_utc"),
    endTimeUTC: timestamp("end_time_utc"),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    idIdx: uniqueIndex("raid_log__raid_log_id_idx").on(table.raidLogId),
  }),
);

export const raidLogsRelations = relations(raidLogs, ({ one, many }) => ({
  raid: one(raids, {
    fields: [raidLogs.raidId],
    references: [raids.raidId],
  }),
  participants: many(raidLogAttendeeMap),
  raidLogAttendeeMap: many(raidLogAttendeeMap),
  raidBenchMap: many(raidBenchMap),
}));

export const raidLogAttendeeMap = tableCreator(
  "raid_log_attendee_map",
  {
    raidLogId: varchar("raid_log_id", { length: 64 })
      .references(() => raidLogs.raidLogId, { onDelete: "cascade" })
      .notNull(),
    characterId: integer("character_id")
      .references(() => characters.characterId, { onDelete: "cascade" })
      .notNull(),
    isIgnored: boolean("is_ignored").default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.raidLogId, table.characterId] }),
    raidLogIdIdx: index("raid_log_attendee_map__raid_log_id_idx").on(
      table.raidLogId,
    ),
    characterIdIdx: index("raid_log_attendee_map__character_id_idx").on(
      table.characterId,
    ),
  }),
);

export const raidLogAttendeeMapRelations = relations(
  raidLogAttendeeMap,
  ({ one }) => ({
    raidLog: one(raidLogs, {
      fields: [raidLogAttendeeMap.raidLogId],
      references: [raidLogs.raidLogId],
    }),
    character: one(characters, {
      fields: [raidLogAttendeeMap.characterId],
      references: [characters.characterId],
    }),
  }),
);

export const raidBenchMap = tableCreator(
  "raid_bench_map",
  {
    raidId: integer("raid_id")
      .references(() => raids.raidId, { onDelete: "cascade" })
      .notNull(),
    characterId: integer("character_id")
      .references(() => characters.characterId)
      .notNull(),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.raidId, table.characterId] }),
    raidIdIdx: index("raid_bench_map__raid_id_idx").on(table.raidId),
    characterIdIdx: index("raid_bench_map__character_id_idx").on(
      table.characterId,
    ),
  }),
);

export const raidBenchMapRelations = relations(raidBenchMap, ({ one }) => ({
  raid: one(raidLogs, {
    fields: [raidBenchMap.raidId],
    references: [raidLogs.raidId],
  }),
  character: one(characters, {
    fields: [raidBenchMap.characterId],
    references: [characters.characterId],
  }),
}));

export const characters = tableCreator(
  "character",
  {
    characterId: integer("character_id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    server: varchar("server", { length: 128 }).default("Unknown").notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    class: varchar("class", { length: 128 }).notNull(),
    classDetail: varchar("class_detail", { length: 256 }).notNull(),
    primaryCharacterId: integer("primary_character_id"),
    isPrimary: boolean("is_primary").generatedAlwaysAs((): SQL => {
      return sql`(${characters.characterId} = COALESCE (${characters.primaryCharacterId}, 0))
                 OR
                 ${characters.primaryCharacterId}
                 IS
                 NULL`;
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
  }),
);

export const charactersRelations = relations(characters, ({ one, many }) => ({
  primaryCharacter: one(characters, {
    fields: [characters.primaryCharacterId],
    references: [characters.characterId],
    relationName: "primary_character"
  }),
  secondaryCharacters: many(characters, {
    relationName: "secondary_characters"
  }),
  user: one(users, {
    fields: [characters.characterId],
    references: [users.characterId],
  }),
  bench: many(raidBenchMap),
}));
