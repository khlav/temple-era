import { relations } from "drizzle-orm";
import {
  pgTableCreator,
  pgEnum,
  foreignKey,
  uniqueIndex,
  index,
  integer,
  varchar,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { IdPkAsUUID, CreatedBy, UpdatedBy, DefaultTimestamps } from "~/server/db/helpers";
import { characters } from "~/server/db/models/raid-schema";
import { WORLD_BUFF_ITEMS } from "~/lib/world-buffs";

const tableCreator = pgTableCreator((name) => name);

export const worldBuffItemEnum = pgEnum("world_buff_item", WORLD_BUFF_ITEMS);

// `ready_to_drop`: the character has completed the prerequisite steps and is queued to turn
// the item in. `dropped`: the one-time turn-in has happened — permanent, lifetime state, never
// resets. There is no "not participating" state; absence of a row means that.
export const worldBuffStateEnum = pgEnum("world_buff_state", ["ready_to_drop", "dropped"]);

// `main`: the character's primary drop priority. `alt`: this character is an alt, lower
// priority than a main submission. `backup`: emergency-only, use if nobody else is available.
export const worldBuffQueueTypeEnum = pgEnum("world_buff_queue_type", ["main", "alt", "backup"]);

// Per-character-per-item submission. Keyed on a free-text character name rather than a
// `characters` FK: that table is populated exclusively by Warcraft Logs raid-log ingestion, so
// a recruit who collects Rend's Head before ever raiding has no character row yet. `characterId`
// is an optional later enrichment, never required at write time.
export const worldBuffCharacterStatus = tableCreator(
  "world_buff_character_status",
  {
    ...IdPkAsUUID,
    characterName: varchar("character_name", { length: 128 }).notNull(),
    // Trimmed + lowercased `characterName`, computed at write time. Free-text names have no
    // precedent elsewhere in this app — without this, "Dunckan" and "dunckan " would silently
    // create two separate rows. Uniqueness is enforced on this column, not the raw name.
    characterNameNormalized: varchar("character_name_normalized", { length: 128 }).notNull(),
    characterId: integer("character_id"),
    item: worldBuffItemEnum("item").notNull(),
    state: worldBuffStateEnum("state").notNull().default("ready_to_drop"),
    queueType: worldBuffQueueTypeEnum("queue_type").notNull().default("main"),
    notes: text("notes"),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    // Manual manager flag — distinct from any future computed "idle raider" signal. Presence (not
    // a boolean) records when a manager tucked this row out of the active queue, mirroring
    // `droppedAt`'s pattern. Cleared (set back to null) to bring the row back into the active
    // list; never auto-clears on its own (e.g. resubmission doesn't touch it).
    markedInactiveAt: timestamp("marked_inactive_at", { withTimezone: true }),
    ...CreatedBy,
    ...UpdatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    nameItemUq: uniqueIndex("world_buff_character_status__name_item_uq").on(
      table.characterNameNormalized,
      table.item,
    ),
    characterIdIdx: index("world_buff_character_status__character_id_idx").on(table.characterId),
    // Explicit shorter name — the default table+column+foreignTable+foreignColumn name for this
    // FK is 66 bytes, over Postgres's 63-byte identifier limit, and would otherwise be silently
    // truncated (same issue access-schema.ts's discord_pending_role_grant hit).
    characterIdFk: foreignKey({
      columns: [table.characterId],
      foreignColumns: [characters.characterId],
      name: "world_buff_character_status_character_id_fk",
    }).onDelete("set null"),
  }),
);

export const worldBuffCharacterStatusRelations = relations(
  worldBuffCharacterStatus,
  ({ one, many }) => ({
    character: one(characters, {
      fields: [worldBuffCharacterStatus.characterId],
      references: [characters.characterId],
    }),
    assignments: many(worldBuffAssignments),
  }),
);

// A scheduled day/time for a raid lead to have a `ready_to_drop` character go turn its item in.
// Freeform `scheduledAt`, not tied to a `raids` row — assignments can be made before a raid
// exists in the system. Multiple assignments can exist per status row over time (e.g.
// rescheduled), so this has its own surrogate PK rather than a composite one. No soft-cancel
// column: an unwanted assignment is edited (reschedule/re-link) or hard-deleted, not cancelled
// in place — there's no "Cancelled" history bucket to preserve.
export const worldBuffAssignments = tableCreator(
  "world_buff_assignment",
  {
    ...IdPkAsUUID,
    statusId: uuid("status_id").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    ...CreatedBy,
    ...UpdatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    statusIdIdx: index("world_buff_assignment__status_id_idx").on(table.statusId),
    scheduledAtIdx: index("world_buff_assignment__scheduled_at_idx").on(table.scheduledAt),
    // Explicit shorter name — default name is 68 bytes, over Postgres's 63-byte limit.
    statusIdFk: foreignKey({
      columns: [table.statusId],
      foreignColumns: [worldBuffCharacterStatus.id],
      name: "world_buff_assignment_status_id_fk",
    }).onDelete("cascade"),
  }),
);

export const worldBuffAssignmentsRelations = relations(worldBuffAssignments, ({ one }) => ({
  status: one(worldBuffCharacterStatus, {
    fields: [worldBuffAssignments.statusId],
    references: [worldBuffCharacterStatus.id],
  }),
}));
