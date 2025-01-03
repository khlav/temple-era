import {
  pgTableCreator,

  index,
  varchar,
} from "drizzle-orm/pg-core";
import {IdPkAsUUID, DefaultTimestamps, CreatedBy} from "~/server/db/helpers";
import * as AuthSchema from "~/server/db/models/auth-schema";
import * as RaidSchema from "~/server/db/models/raid-schema";

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

  // // Views
  // raidAttendeesMap,

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
