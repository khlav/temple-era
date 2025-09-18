import { timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "~/server/db/models/auth-schema";

export const IdPkAsUUID = {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
};

export const CreatedBy = {
  createdById: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
};

export const UpdatedBy = {
  updatedById: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
};

export const DefaultTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
    () => new Date(),
  ),
};
