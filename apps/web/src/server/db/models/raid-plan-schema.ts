import {
  pgTableCreator,
  uniqueIndex,
  index,
  integer,
  varchar,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { IdPkAsUUID, DefaultTimestamps, CreatedBy } from "~/server/db/helpers";
import { raids, characters } from "~/server/db/models/raid-schema";

const tableCreator = pgTableCreator((name) => name);

// =============================================================================
// TEMPLATE TABLES (for /raid-planner-config)
// =============================================================================

/**
 * Zone templates define default encounters for each raid zone.
 * One template per zone. Managed via /raid-planner-config.
 */
export const raidPlanTemplates = tableCreator(
  "raid_plan_template",
  {
    ...IdPkAsUUID,
    zoneId: varchar("zone_id", { length: 64 }).notNull(),
    zoneName: varchar("zone_name", { length: 256 }).notNull(),
    defaultGroupCount: integer("default_group_count").notNull().default(8),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    zoneIdIdx: uniqueIndex("raid_plan_template__zone_id_idx").on(table.zoneId),
  }),
);

export const raidPlanTemplatesRelations = relations(
  raidPlanTemplates,
  ({ many }) => ({
    encounters: many(raidPlanTemplateEncounters),
  }),
);

/**
 * Encounter presets for a zone template.
 * All encounters are copied to new raid plans for this zone.
 */
export const raidPlanTemplateEncounters = tableCreator(
  "raid_plan_template_encounter",
  {
    ...IdPkAsUUID,
    templateId: uuid("template_id")
      .notNull()
      .references(() => raidPlanTemplates.id, { onDelete: "cascade" }),
    encounterKey: varchar("encounter_key", { length: 64 }).notNull(),
    encounterName: varchar("encounter_name", { length: 256 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...DefaultTimestamps,
  },
  (table) => ({
    templateIdIdx: index("raid_plan_template_encounter__template_id_idx").on(
      table.templateId,
    ),
  }),
);

export const raidPlanTemplateEncountersRelations = relations(
  raidPlanTemplateEncounters,
  ({ one }) => ({
    template: one(raidPlanTemplates, {
      fields: [raidPlanTemplateEncounters.templateId],
      references: [raidPlanTemplates.id],
    }),
  }),
);

// =============================================================================
// PLAN TABLES (for /raid-planner)
// =============================================================================

/**
 * A raid plan for a specific event.
 * One plan per event (unique constraint on eventId).
 */
export const raidPlans = tableCreator(
  "raid_plan",
  {
    ...IdPkAsUUID,
    eventId: integer("event_id").references(() => raids.raidId, {
      onDelete: "cascade",
    }),
    zoneId: varchar("zone_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    eventIdIdx: uniqueIndex("raid_plan__event_id_idx").on(table.eventId),
  }),
);

export const raidPlansRelations = relations(raidPlans, ({ one, many }) => ({
  event: one(raids, {
    fields: [raidPlans.eventId],
    references: [raids.raidId],
  }),
  characters: many(raidPlanCharacters),
  encounters: many(raidPlanEncounters),
}));

/**
 * Characters in a raid plan with their default group assignments.
 * NULL group/position = bench/unassigned.
 */
export const raidPlanCharacters = tableCreator(
  "raid_plan_character",
  {
    ...IdPkAsUUID,
    raidPlanId: uuid("raid_plan_id")
      .notNull()
      .references(() => raidPlans.id, { onDelete: "cascade" }),
    characterId: integer("character_id").references(
      () => characters.characterId,
      { onDelete: "set null" },
    ),
    characterName: varchar("character_name", { length: 128 }).notNull(),
    defaultGroup: integer("default_group"), // 0-7 for 40-man, 0-3 for 20-man. NULL = bench
    defaultPosition: integer("default_position"), // 0-4. NULL when benched
    ...DefaultTimestamps,
  },
  (table) => ({
    raidPlanIdIdx: index("raid_plan_character__raid_plan_id_idx").on(
      table.raidPlanId,
    ),
    characterIdIdx: index("raid_plan_character__character_id_idx").on(
      table.characterId,
    ),
  }),
);

export const raidPlanCharactersRelations = relations(
  raidPlanCharacters,
  ({ one, many }) => ({
    raidPlan: one(raidPlans, {
      fields: [raidPlanCharacters.raidPlanId],
      references: [raidPlans.id],
    }),
    character: one(characters, {
      fields: [raidPlanCharacters.characterId],
      references: [characters.characterId],
    }),
    encounterAssignments: many(raidPlanEncounterAssignments),
  }),
);

/**
 * Encounters configured for a raid plan.
 * Copied from template on plan creation, then user can add/remove.
 */
export const raidPlanEncounters = tableCreator(
  "raid_plan_encounter",
  {
    ...IdPkAsUUID,
    raidPlanId: uuid("raid_plan_id")
      .notNull()
      .references(() => raidPlans.id, { onDelete: "cascade" }),
    encounterKey: varchar("encounter_key", { length: 64 }).notNull(),
    encounterName: varchar("encounter_name", { length: 256 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    useDefaultGroups: boolean("use_default_groups").notNull().default(true),
    ...DefaultTimestamps,
  },
  (table) => ({
    raidPlanIdIdx: index("raid_plan_encounter__raid_plan_id_idx").on(
      table.raidPlanId,
    ),
  }),
);

export const raidPlanEncountersRelations = relations(
  raidPlanEncounters,
  ({ one, many }) => ({
    raidPlan: one(raidPlans, {
      fields: [raidPlanEncounters.raidPlanId],
      references: [raidPlans.id],
    }),
    assignments: many(raidPlanEncounterAssignments),
  }),
);

/**
 * Custom group assignments for a specific encounter.
 * Only populated when useDefaultGroups = false on the encounter.
 * NULL group/position = benched for this encounter.
 */
export const raidPlanEncounterAssignments = tableCreator(
  "raid_plan_encounter_assignment",
  {
    ...IdPkAsUUID,
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => raidPlanEncounters.id, { onDelete: "cascade" }),
    planCharacterId: uuid("plan_character_id")
      .notNull()
      .references(() => raidPlanCharacters.id, { onDelete: "cascade" }),
    groupNumber: integer("group_number"), // 0-7. NULL = benched for this encounter
    position: integer("position"), // 0-4. NULL when benched
    ...DefaultTimestamps,
  },
  (table) => ({
    encounterIdIdx: index(
      "raid_plan_encounter_assignment__encounter_id_idx",
    ).on(table.encounterId),
    planCharacterIdIdx: index(
      "raid_plan_encounter_assignment__plan_character_id_idx",
    ).on(table.planCharacterId),
  }),
);

export const raidPlanEncounterAssignmentsRelations = relations(
  raidPlanEncounterAssignments,
  ({ one }) => ({
    encounter: one(raidPlanEncounters, {
      fields: [raidPlanEncounterAssignments.encounterId],
      references: [raidPlanEncounters.id],
    }),
    planCharacter: one(raidPlanCharacters, {
      fields: [raidPlanEncounterAssignments.planCharacterId],
      references: [raidPlanCharacters.id],
    }),
  }),
);
