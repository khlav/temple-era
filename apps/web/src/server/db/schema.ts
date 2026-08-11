import * as AuthSchema from "~/server/db/models/auth-schema";
import * as RaidSchema from "~/server/db/models/raid-schema";
import * as RaidPlanSchema from "~/server/db/models/raid-plan-schema";
import * as RecipeSchema from "~/server/db/models/recipe-schema";
import * as AccessSchema from "~/server/db/models/access-schema";
import * as RaidHelperSnapshotSchema from "~/server/db/models/raid-helper-snapshot-schema";
import * as RaidSignupLinkSchema from "~/server/db/models/raid-signup-link-schema";
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
  raidPlanTemplateEncounterGroups,
  raidPlanTemplateEncounters,

  // Plan Tables
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounterGroups,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,
  raidPlanEncounterNotes,
  raidPlanPresence,

  // Relations
  raidPlanTemplatesRelations,
  raidPlanTemplateEncounterGroupsRelations,
  raidPlanTemplateEncountersRelations,
  raidPlansRelations,
  raidPlanCharactersRelations,
  raidPlanEncounterGroupsRelations,
  raidPlanEncountersRelations,
  raidPlanEncounterAssignmentsRelations,
  raidPlanEncounterAASlotsRelations,
  raidPlanEncounterNotesRelations,
  raidPlanPresenceRelations,
} = RaidPlanSchema;

export const {
  // Tables
  roles,
  userRoles,
  discordRoleBindings,
  discordPendingRoleGrants,
  discordSyncState,

  // Relations
  rolesRelations,
  userRolesRelations,
  discordRoleBindingsRelations,
  discordPendingRoleGrantsRelations,

  // Enums
  scopeEnum,
  userRoleSourceEnum,

  // Types/constants
  SCOPES,
} = AccessSchema;
export type { Scope, UserRoleSource } from "~/server/db/models/access-schema";

export const {
  // Tables
  raidHelperSignupSnapshots,
  raidHelperSignupSnapshotSchedule,

  // Enums
  snapshotCheckpointEnum,
} = RaidHelperSnapshotSchema;
export type { RaidHelperSignupSnapshotEntry } from "~/server/db/models/raid-helper-snapshot-schema";

export const {
  // Tables
  raidSignupSnapshotLinks,

  // Relations
  raidSignupSnapshotLinksRelations,

  // Enums
  raidSignupLinkSourceEnum,
} = RaidSignupLinkSchema;
export type { RaidSignupLinkMatchReason } from "~/server/db/models/raid-signup-link-schema";

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
