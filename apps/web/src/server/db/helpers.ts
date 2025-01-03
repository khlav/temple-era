import {timestamp, uuid} from 'drizzle-orm/pg-core';
import {sql} from "drizzle-orm";
import {users} from "~/server/db/schema";

export const IdPkAsUUID = {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
};

export const CreatedBy = {
  createdById: uuid("created_by")
      .notNull()
      .references(() => users.id)
};

export const UpdatedBy = {
  updatedById: uuid("updated_by")
    .notNull()
    .references(() => users.id)
};


export const DefaultTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(() => new Date()),
}