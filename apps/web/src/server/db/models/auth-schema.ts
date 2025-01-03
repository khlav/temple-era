import { relations, sql } from "drizzle-orm";
import {
  pgTableCreator,

  index,
  integer,
  uuid,
  primaryKey,
  text,
  timestamp,
  varchar,
  boolean, uniqueIndex,
} from "drizzle-orm/pg-core";
import {IdPkAsUUID } from "~/server/db/helpers";
import { type AdapterAccount } from "next-auth/adapters";
import {characters} from "~/server/db/models/raid-schema";
/*
  schema: auth
 */
const tableCreator = pgTableCreator((name) => `auth_${name}`)

export const users = tableCreator("user", {
  ...IdPkAsUUID,
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: timestamp("email_verified", {
    mode: "date",
    withTimezone: true,
  }).default(sql`CURRENT_TIMESTAMP`),
  image: varchar("image", { length: 255 }),
  isAdmin: boolean("is_admin").default(false),
  characterId: integer("character_id"),
},
  (user) => ({
    idIdx: uniqueIndex("user__id_idx").on(user.id)
  })
);

export const usersRelations = relations(users, ({ one, many }) => ({
  accounts: many(accounts),
  character: one(characters, {
    fields: [users.characterId],
    references: [characters.characterId]
  })
}));

export const accounts = tableCreator(
  "account",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    type: varchar("type", { length: 255 }).$type<AdapterAccount["type"]>().notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_user_id_idx").on(account.userId),
  }),
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id]
  }),
}));

export const sessions = tableCreator(
  "session",
  {
    sessionToken: varchar("session_token", { length: 255 })
      .notNull()
      .primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (session) => ({
    userIdIdx: index("session_user_id_idx").on(session.userId),
  })
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = tableCreator(
  "verification_token",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);
