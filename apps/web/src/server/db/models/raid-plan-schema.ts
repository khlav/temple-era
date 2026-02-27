import {
  pgTableCreator,
  uniqueIndex,
  index,
  integer,
  varchar,
  boolean,
  uuid,
  text,
  timestamp,
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
    defaultAATemplate: text("default_aa_template"), // AA template for Default/Trash
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
    encounterGroups: many(raidPlanTemplateEncounterGroups),
  }),
);

/**
 * Encounter groups for a zone template.
 * Groups organize encounters into collapsible sections (e.g., "Spider Wing").
 * Groups and ungrouped encounters share a global sortOrder space.
 */
export const raidPlanTemplateEncounterGroups = tableCreator(
  "raid_plan_template_encounter_group",
  {
    ...IdPkAsUUID,
    templateId: uuid("template_id")
      .notNull()
      .references(() => raidPlanTemplates.id, { onDelete: "cascade" }),
    groupName: varchar("group_name", { length: 256 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...DefaultTimestamps,
  },
  (table) => ({
    templateIdIdx: index(
      "raid_plan_template_encounter_group__template_id_idx",
    ).on(table.templateId),
  }),
);

export const raidPlanTemplateEncounterGroupsRelations = relations(
  raidPlanTemplateEncounterGroups,
  ({ one, many }) => ({
    template: one(raidPlanTemplates, {
      fields: [raidPlanTemplateEncounterGroups.templateId],
      references: [raidPlanTemplates.id],
    }),
    encounters: many(raidPlanTemplateEncounters),
  }),
);

/**
 * Encounter presets for a zone template.
 * All encounters are copied to new raid plans for this zone.
 * Encounters with a groupId belong to that group; NULL groupId = top-level.
 */
export const raidPlanTemplateEncounters = tableCreator(
  "raid_plan_template_encounter",
  {
    ...IdPkAsUUID,
    templateId: uuid("template_id")
      .notNull()
      .references(() => raidPlanTemplates.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(
      () => raidPlanTemplateEncounterGroups.id,
      { onDelete: "set null" },
    ),
    encounterKey: varchar("encounter_key", { length: 64 }).notNull(),
    encounterName: varchar("encounter_name", { length: 256 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    aaTemplate: text("aa_template"), // AngryAssignments template text
    ...DefaultTimestamps,
  },
  (table) => ({
    templateIdIdx: index("raid_plan_template_encounter__template_id_idx").on(
      table.templateId,
    ),
    groupIdIdx: index("raid_plan_template_encounter__group_id_idx").on(
      table.groupId,
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
    group: one(raidPlanTemplateEncounterGroups, {
      fields: [raidPlanTemplateEncounters.groupId],
      references: [raidPlanTemplateEncounterGroups.id],
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
    raidHelperEventId: varchar("raid_helper_event_id", {
      length: 64,
    }).notNull(),
    eventId: integer("event_id").references(() => raids.raidId, {
      onDelete: "cascade",
    }),
    zoneId: varchar("zone_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    defaultAATemplate: text("default_aa_template"), // AA template for Default/Trash view
    useDefaultAA: boolean("use_default_aa").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),
    startAt: timestamp("start_at"),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    raidHelperEventIdIdx: uniqueIndex("raid_plan__raid_helper_event_id_idx").on(
      table.raidHelperEventId,
    ),
    eventIdIdx: uniqueIndex("raid_plan__event_id_idx").on(table.eventId),
  }),
);

export const raidPlansRelations = relations(raidPlans, ({ one, many }) => ({
  event: one(raids, {
    fields: [raidPlans.eventId],
    references: [raids.raidId],
  }),
  characters: many(raidPlanCharacters),
  encounterGroups: many(raidPlanEncounterGroups),
  encounters: many(raidPlanEncounters),
  defaultAASlots: many(raidPlanEncounterAASlots),
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
    writeInClass: varchar("write_in_class", { length: 32 }), // Class for write-in characters (no characterId)
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
    aaSlotAssignments: many(raidPlanEncounterAASlots),
  }),
);

/**
 * Encounter groups for a raid plan.
 * Groups organize encounters into collapsible sections (e.g., "Spider Wing").
 * Groups and ungrouped encounters share a global sortOrder space.
 */
export const raidPlanEncounterGroups = tableCreator(
  "raid_plan_encounter_group",
  {
    ...IdPkAsUUID,
    raidPlanId: uuid("raid_plan_id")
      .notNull()
      .references(() => raidPlans.id, { onDelete: "cascade" }),
    groupName: varchar("group_name", { length: 256 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...DefaultTimestamps,
  },
  (table) => ({
    raidPlanIdIdx: index("raid_plan_encounter_group__raid_plan_id_idx").on(
      table.raidPlanId,
    ),
  }),
);

export const raidPlanEncounterGroupsRelations = relations(
  raidPlanEncounterGroups,
  ({ one, many }) => ({
    raidPlan: one(raidPlans, {
      fields: [raidPlanEncounterGroups.raidPlanId],
      references: [raidPlans.id],
    }),
    encounters: many(raidPlanEncounters),
  }),
);

/**
 * Encounters configured for a raid plan.
 * Copied from template on plan creation, then user can add/remove.
 * Encounters with a groupId belong to that group; NULL groupId = top-level.
 */
export const raidPlanEncounters = tableCreator(
  "raid_plan_encounter",
  {
    ...IdPkAsUUID,
    raidPlanId: uuid("raid_plan_id")
      .notNull()
      .references(() => raidPlans.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => raidPlanEncounterGroups.id, {
      onDelete: "set null",
    }),
    encounterKey: varchar("encounter_key", { length: 64 }).notNull(),
    encounterName: varchar("encounter_name", { length: 256 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    useDefaultGroups: boolean("use_default_groups").notNull().default(true),
    aaTemplate: text("aa_template"), // AngryAssignments template (copied from template, editable)
    useCustomAA: boolean("use_custom_aa").notNull().default(false), // Whether to show AA UI
    ...DefaultTimestamps,
  },
  (table) => ({
    raidPlanIdIdx: index("raid_plan_encounter__raid_plan_id_idx").on(
      table.raidPlanId,
    ),
    groupIdIdx: index("raid_plan_encounter__group_id_idx").on(table.groupId),
  }),
);

export const raidPlanEncountersRelations = relations(
  raidPlanEncounters,
  ({ one, many }) => ({
    raidPlan: one(raidPlans, {
      fields: [raidPlanEncounters.raidPlanId],
      references: [raidPlans.id],
    }),
    group: one(raidPlanEncounterGroups, {
      fields: [raidPlanEncounters.groupId],
      references: [raidPlanEncounterGroups.id],
    }),
    assignments: many(raidPlanEncounterAssignments),
    aaSlots: many(raidPlanEncounterAASlots),
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

/**
 * AngryAssignments slot assignments for encounters and default view.
 * Maps characters to named slots within an AA template.
 * Each character can only be assigned to one slot per context (encounter or default).
 *
 * Usage:
 * - For encounter-specific AA: encounterId is set, raidPlanId is null
 * - For default/trash AA: encounterId is null, raidPlanId is set
 */
export const raidPlanEncounterAASlots = tableCreator(
  "raid_plan_encounter_aa_slot",
  {
    ...IdPkAsUUID,
    encounterId: uuid("encounter_id").references(() => raidPlanEncounters.id, {
      onDelete: "cascade",
    }),
    raidPlanId: uuid("raid_plan_id").references(() => raidPlans.id, {
      onDelete: "cascade",
    }),
    planCharacterId: uuid("plan_character_id")
      .notNull()
      .references(() => raidPlanCharacters.id, { onDelete: "cascade" }),
    slotName: varchar("slot_name", { length: 128 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...DefaultTimestamps,
  },
  (table) => ({
    encounterIdIdx: index("aa_slot__encounter_id_idx").on(table.encounterId),
    raidPlanIdIdx: index("aa_slot__raid_plan_id_idx").on(table.raidPlanId),
    planCharacterIdIdx: index("aa_slot__plan_character_id_idx").on(
      table.planCharacterId,
    ),
  }),
);

export const raidPlanEncounterAASlotsRelations = relations(
  raidPlanEncounterAASlots,
  ({ one }) => ({
    encounter: one(raidPlanEncounters, {
      fields: [raidPlanEncounterAASlots.encounterId],
      references: [raidPlanEncounters.id],
    }),
    raidPlan: one(raidPlans, {
      fields: [raidPlanEncounterAASlots.raidPlanId],
      references: [raidPlans.id],
    }),
    planCharacter: one(raidPlanCharacters, {
      fields: [raidPlanEncounterAASlots.planCharacterId],
      references: [raidPlanCharacters.id],
    }),
  }),
);
