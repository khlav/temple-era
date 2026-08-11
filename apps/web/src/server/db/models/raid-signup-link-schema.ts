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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { IdPkAsUUID, CreatedBy, DefaultTimestamps } from "~/server/db/helpers";
import { raids } from "~/server/db/models/raid-schema";

const tableCreator = pgTableCreator((name) => name);

export const raidSignupLinkSourceEnum = pgEnum("raid_signup_link_source", ["auto", "manual"]);

export interface RaidSignupLinkMatchReason {
  timingDeltaMinutes: number;
  timingScore: number;
  zoneScore: number;
  zoneMatchQuality: "exact_softres" | "exact_title_parse" | "unavailable" | "mismatch";
}

/**
 * Links a completed raid to the Raid Helper event occurrence its signups were
 * collected under (TEMPLE-84/86). Points at an occurrence key (raidHelperEventId,
 * startTime), NOT a specific raid_helper_signup_snapshot row — same reasoning as that
 * table's own no-FK-to-raid_plan design (see raid-helper-snapshot-schema.ts): pinning
 * to "today's latest snapshot" would go stale the moment a later checkpoint fires.
 * Resolve the actual latest snapshot for a link at read time via
 * getLatestSignupSnapshotForOccurrence.
 *
 * At most one row per raid — `raidId` is unique. There is no review/candidate state
 * (TEMPLE-86 dropped that): matching either writes its best guess directly, or writes
 * nothing at all when nothing clears the confidence floor or the top candidates are too
 * close to call (see raid-signup-link-matching.ts). `reassign` is the only manual
 * override, and it replaces this row in place (upsert on raidId) rather than
 * soft-rejecting a prior one — there's nothing to keep a trail of once there's only ever
 * one live row.
 *
 * An occurrence can still back multiple raids (doubleheaders) — the one-per-raid
 * constraint is on raidId only, not on the occurrence.
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
    source: raidSignupLinkSourceEnum("source").notNull().default("auto"),
    confidence: real("confidence").notNull(),
    matchReason: jsonb("match_reason").$type<RaidSignupLinkMatchReason>().notNull(),
    ...CreatedBy,
    ...DefaultTimestamps,
  },
  (table) => ({
    raidIdIdx: uniqueIndex("raid_signup_snapshot_link__raid_id_idx").on(table.raidId),
    // Occurrence-side lookups (reporting join: all raids linked to one occurrence).
    eventStartIdx: index("raid_signup_snapshot_link__event_start_idx").on(
      table.raidHelperEventId,
      table.startTime,
    ),
  }),
);

export const raidSignupSnapshotLinksRelations = relations(raidSignupSnapshotLinks, ({ one }) => ({
  raid: one(raids, {
    fields: [raidSignupSnapshotLinks.raidId],
    references: [raids.raidId],
  }),
}));
