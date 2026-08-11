import {
  pgTableCreator,
  pgEnum,
  uniqueIndex,
  index,
  integer,
  varchar,
  timestamp,
  jsonb,
  real,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { IdPkAsUUID, CreatedBy, DefaultTimestamps } from "~/server/db/helpers";
import { raids } from "~/server/db/models/raid-schema";
import { users } from "~/server/db/models/auth-schema";

const tableCreator = pgTableCreator((name) => name);

export const raidSignupLinkStatusEnum = pgEnum("raid_signup_link_status", [
  "candidate", // auto-generated, awaiting human confirmation
  "confirmed", // auto-linked (high confidence) or manually confirmed
  "rejected", // manually dismissed — kept as a row so it's never re-proposed
]);

export const raidSignupLinkSourceEnum = pgEnum("raid_signup_link_source", ["auto", "manual"]);

export interface RaidSignupLinkMatchReason {
  timingDeltaMinutes: number;
  timingScore: number;
  zoneScore: number;
  zoneMatchQuality: "exact_softres" | "exact_title_parse" | "unavailable" | "mismatch";
}

/**
 * Links a completed raid to the Raid Helper event occurrence its signups were
 * collected under (TEMPLE-84). Points at an occurrence key (raidHelperEventId,
 * startTime), NOT a specific raid_helper_signup_snapshot row — same reasoning as that
 * table's own no-FK-to-raid_plan design (see raid-helper-snapshot-schema.ts): pinning
 * to "today's latest snapshot" would go stale the moment a later checkpoint fires.
 * Resolve the actual latest snapshot for a link at read time via
 * getLatestSignupSnapshotForOccurrence.
 *
 * One-to-many by omission: uniqueness is (raidId, raidHelperEventId, startTime), not
 * on the occurrence alone, so multiple raids (doubleheaders) can each hold their own
 * row pointing at the same occurrence.
 *
 * status: "rejected" is the review/override mechanism — a persisted decision, not a
 * delete, so the matcher never re-proposes a dismissed pairing and there's an audit
 * trail (reviewedById/reviewedAt).
 */
export const raidSignupSnapshotLinks = tableCreator(
  "raid_signup_snapshot_link",
  {
    ...IdPkAsUUID,
    raidId: integer("raid_id")
      .notNull()
      .references(() => raids.raidId, { onDelete: "cascade" }),
    raidHelperEventId: varchar("raid_helper_event_id", { length: 64 }).notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    status: raidSignupLinkStatusEnum("status").notNull().default("candidate"),
    source: raidSignupLinkSourceEnum("source").notNull().default("auto"),
    confidence: real("confidence").notNull(),
    matchReason: jsonb("match_reason").$type<RaidSignupLinkMatchReason>().notNull(),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    raidEventStartIdx: uniqueIndex("raid_signup_snapshot_link__raid_event_start_idx").on(
      table.raidId,
      table.raidHelperEventId,
      table.startTime,
    ),
    // Occurrence-side lookups (reporting join: all raids linked to one occurrence).
    eventStartIdx: index("raid_signup_snapshot_link__event_start_idx").on(
      table.raidHelperEventId,
      table.startTime,
    ),
    raidIdIdx: index("raid_signup_snapshot_link__raid_id_idx").on(table.raidId),
    statusIdx: index("raid_signup_snapshot_link__status_idx").on(table.status),
  }),
);

export const raidSignupSnapshotLinksRelations = relations(raidSignupSnapshotLinks, ({ one }) => ({
  raid: one(raids, {
    fields: [raidSignupSnapshotLinks.raidId],
    references: [raids.raidId],
  }),
  reviewedBy: one(users, {
    fields: [raidSignupSnapshotLinks.reviewedById],
    references: [users.id],
  }),
}));
