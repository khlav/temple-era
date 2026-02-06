import * as AuthSchema from "~/server/db/models/auth-schema";
import * as RaidSchema from "~/server/db/models/raid-schema";
import * as RaidPlanSchema from "~/server/db/models/raid-plan-schema";
import * as RecipeSchema from "~/server/db/models/recipe-schema";
import * as ViewsSchema from "~/server/db/models/views-schema";

// NOTE: views-schema is defined but not imported due to Drizzle

export const {
  // Tables
  users,
  accounts,
  sessions,
  verificationTokens,

  // Relations
  usersRelations,
  accountsRelations,
  sessionsRelations,
} = AuthSchema;

export const {
  // Tables
  raids,
  raidLogs,
  raidLogAttendeeMap,
  raidBenchMap,
  characters,

  // Relations
  raidsRelations,
  raidLogsRelations,
  raidLogAttendeeMapRelations,
  raidBenchMapRelations,
  charactersRelations,

  // Enums
  createdViaEnum,
  updatedViaEnum,
} = RaidSchema;

export const {
  // Tables
  recipes,
  characterRecipeMap,

  // Relations
  recipesRelations,
  characterRecipeMapRelations,

  // Enums
  professionEnum,
} = RecipeSchema;

export const {
  // Template Tables
  raidPlanTemplates,
  raidPlanTemplateEncounters,

  // Plan Tables
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,

  // Relations
  raidPlanTemplatesRelations,
  raidPlanTemplateEncountersRelations,
  raidPlansRelations,
  raidPlanCharactersRelations,
  raidPlanEncountersRelations,
  raidPlanEncounterAssignmentsRelations,
  raidPlanEncounterAASlotsRelations,
} = RaidPlanSchema;

export const {
  primaryRaidAttendeeMap,
  primaryRaidBenchMap,
  primaryRaidAttendeeAndBenchMap,
  primaryRaidAttendanceL6LockoutWk,
  trackedRaidsL6LockoutWk,
  trackedRaidsCurrentLockout,
  allRaidsCurrentLockout,
  reportDates,
} = ViewsSchema;
