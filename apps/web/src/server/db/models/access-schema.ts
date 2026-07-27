import { relations, sql } from "drizzle-orm";
import {
  pgTableCreator,
  pgEnum,
  foreignKey,
  uniqueIndex,
  index,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { CreatedBy, UpdatedBy, DefaultTimestamps } from "~/server/db/helpers";
import { users } from "~/server/db/models/auth-schema";
import { SCOPES } from "~/lib/scopes";

export { SCOPE, SCOPES, type Scope } from "~/lib/scopes";

const tableCreator = pgTableCreator((name) => name);

export const scopeEnum = pgEnum("scope", SCOPES);

const userRoleSourceEnumValues: [string, ...string[]] = ["manual", "discord-sync"];
export const userRoleSourceEnum = pgEnum("user_role_source", userRoleSourceEnumValues);
export type UserRoleSource = (typeof userRoleSourceEnumValues)[number];

// Shared by user_role and discord_pending_role_grant: which mechanism most recently asserted
// a grant. Sync only ever revokes rows it owns (source = 'discord-sync' + matching
// sourceBindingId) — manual grants are never touched. The FK on sourceBindingId is added
// per-table in each table's config block (not inline here) so each can name its own
// constraint where needed — see discord_pending_role_grant's explicit foreignKey() below.
const SourceTracking = {
  source: userRoleSourceEnum("source").notNull().default("manual"),
  sourceBindingId: uuid("source_binding_id"),
};

export const roles = tableCreator(
  "role",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: varchar("name", { length: 100 }).notNull(),
    scopes: scopeEnum("scopes")
      .array()
      .notNull()
      .default(sql`ARRAY[]::scope[]`),
    // Protects the backfilled "Raid Manager"/"Admin" roles from deletion/rename.
    isSystem: boolean("is_system").notNull().default(false),
    ...CreatedBy,
    ...UpdatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    nameIdx: uniqueIndex("role__name_idx").on(table.name),
  }),
);

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  discordRoleBindings: many(discordRoleBindings),
  pendingGrants: many(discordPendingRoleGrants),
}));

export const discordRoleBindings = tableCreator(
  "discord_role_binding",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    discordRoleId: varchar("discord_role_id", { length: 32 }).notNull(),
    // Cached label for display; refreshed on each sync run.
    discordRoleName: varchar("discord_role_name", { length: 100 }).notNull(),
    appRoleId: uuid("app_role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    // Unique on (discordRoleId, appRoleId) rather than discordRoleId alone, so a single Discord
    // role can be bound to more than one app role (e.g. "Council" granting both Raid Manager
    // and Admin) as two separate rows instead of the second silently replacing the first.
    discordRoleAppRoleIdx: uniqueIndex("discord_role_binding__discord_role_app_role_idx").on(
      table.discordRoleId,
      table.appRoleId,
    ),
  }),
);

export const discordRoleBindingsRelations = relations(discordRoleBindings, ({ one, many }) => ({
  appRole: one(roles, { fields: [discordRoleBindings.appRoleId], references: [roles.id] }),
  userRoles: many(userRoles),
  pendingGrants: many(discordPendingRoleGrants),
}));

// A user can hold the same role via more than one grant simultaneously — e.g. two different
// Discord role bindings both mapping to "Raid Manager", or a manual grant alongside a synced
// one. Each grant is its own row (id PK, not a (userId, roleId) composite key) so all of them
// stay visible and independently revocable instead of one silently overwriting another.
export const userRoles = tableCreator(
  "user_role",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ...SourceTracking,
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    userIdIdx: index("user_role__user_id_idx").on(table.userId),
    sourceBindingFk: foreignKey({
      columns: [table.sourceBindingId],
      foreignColumns: [discordRoleBindings.id],
    }).onDelete("set null"),
    // At most one manual grant per (user, role) — manual grants aren't tied to a binding, so
    // there's nothing to dedupe duplicates by.
    manualUq: uniqueIndex("user_role__manual_uq")
      .on(table.userId, table.roleId)
      .where(sql`${table.source} = 'manual'`),
    // At most one sync-owned grant per (user, role, binding) — lets two different bindings that
    // map to the same app role coexist as separate, independently-revocable grants.
    syncUq: uniqueIndex("user_role__sync_uq")
      .on(table.userId, table.roleId, table.sourceBindingId)
      .where(sql`${table.source} = 'discord-sync'`),
  }),
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  sourceBinding: one(discordRoleBindings, {
    fields: [userRoles.sourceBindingId],
    references: [discordRoleBindings.id],
  }),
}));

// Pre-authorization for Discord accounts that haven't logged into the site yet. Kept separate
// from user_role (whose userId is NOT NULL + FK'd) rather than a nullable-userId variant, so
// permission-resolution queries never need to filter out not-yet-real users. Materialized into
// user_role and deleted on first login (see access-service.ts).
export const discordPendingRoleGrants = tableCreator(
  "discord_pending_role_grant",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    discordUserId: varchar("discord_user_id", { length: 32 }).notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ...SourceTracking,
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    // Explicit shorter name — the table/column name combination would otherwise produce an
    // auto-generated FK constraint name over Postgres's 63-byte identifier limit.
    sourceBindingFk: foreignKey({
      columns: [table.sourceBindingId],
      foreignColumns: [discordRoleBindings.id],
      name: "discord_pending_grant_source_binding_fk",
    }).onDelete("set null"),
    // Same duplicate-source-tracking pattern as user_role: one manual pending grant per
    // (discordUserId, role), one sync-owned pending grant per (discordUserId, role, binding).
    manualUq: uniqueIndex("discord_pending_role_grant__manual_uq")
      .on(table.discordUserId, table.roleId)
      .where(sql`${table.source} = 'manual'`),
    syncUq: uniqueIndex("discord_pending_role_grant__sync_uq")
      .on(table.discordUserId, table.roleId, table.sourceBindingId)
      .where(sql`${table.source} = 'discord-sync'`),
  }),
);

export const discordPendingRoleGrantsRelations = relations(discordPendingRoleGrants, ({ one }) => ({
  role: one(roles, { fields: [discordPendingRoleGrants.roleId], references: [roles.id] }),
  sourceBinding: one(discordRoleBindings, {
    fields: [discordPendingRoleGrants.sourceBindingId],
    references: [discordRoleBindings.id],
  }),
}));

// Singleton row (id fixed at 1) tracking the last Discord role sync run, for the admin UI.
export const discordSyncState = tableCreator("discord_sync_state", {
  id: integer("id").primaryKey().default(1),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSyncSummary: text("last_sync_summary"),
});
