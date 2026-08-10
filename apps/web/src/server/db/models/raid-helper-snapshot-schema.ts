import {
  pgTableCreator,
  pgEnum,
  uniqueIndex,
  index,
  integer,
  varchar,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { IdPkAsUUID, DefaultTimestamps } from "~/server/db/helpers";

const tableCreator = pgTableCreator((name) => name);

// Named generically (not "raid_helper_*") so a future SoftRes snapshot table (TEMPLE-77)
// can reuse the same enum type if it adopts the same T-72h/48h/24h/0h offsets.
export const snapshotCheckpointEnum = pgEnum("snapshot_checkpoint", ["72h", "48h", "24h", "0h"]);

export interface RaidHelperSignupSnapshotEntry {
  userId: string;
  name: string;
  className: string;
  specName: string;
  roleName: string;
  status: string;
  position: number;
  entryTime: number;
}

/**
 * A point-in-time capture of Raid Helper signups for a scheduled event, taken at a
 * fixed offset before the raid's start time. One row per (event, checkpoint, startTime)
 * — the unique index below is also the idempotency guard against overlapping/retried
 * captures (insert uses onConflictDoNothing on this key) — QStash delivery is
 * at-least-once.
 *
 * startTime is part of the key, not just (event, checkpoint): Raid Helper's events-list
 * `id` is not guaranteed unique across occurrences of a recurring event in every usage
 * pattern (see raidHelperEventId's own comment below) — without startTime disambiguating,
 * a reused id would make a later occurrence's checkpoint look "already captured" and
 * onConflictDoNothing would silently drop its real data.
 *
 * Deliberately has no FK to raid_plan: raid_plan rows are often created after the
 * earliest checkpoints already fired, so a denormalized raidPlanId captured at write
 * time would go stale. Join on raidHelperEventId = raid_plan.raidHelperEventId instead.
 *
 * title/channelName/channelId/softresId/scheduledId (TEMPLE-84) are raw fields copied
 * from the Raid Helper event detail response at capture time, purely for audit/debug
 * and as inputs to `zone` derivation below — never re-fetched or re-derived after
 * insert, same "denormalize once, accept staleness" posture as startTime.
 *
 * zone/zoneSource (TEMPLE-84): a normalized RaidZone name (see ~/lib/raid-zones),
 * resolved once at capture time — see resolveSnapshotZone in
 * ~/server/services/raid-helper-snapshot-capture. Exists so raid<->event linking
 * (raid_signup_snapshot_link) can match on a real column instead of re-parsing title
 * text at every match attempt. NULL on rows captured before this field existed, or
 * when neither resolution tier could determine a zone.
 */
export const raidHelperSignupSnapshots = tableCreator(
  "raid_helper_signup_snapshot",
  {
    ...IdPkAsUUID,
    // Correlates to raid_plan.raidHelperEventId and to the `id` field in Raid Helper's
    // /v4/servers/{id}/events postedEvents list — the stable "channel" id, NOT
    // necessarily the id the signups were actually fetched from (see resolvedEventId).
    raidHelperEventId: varchar("raid_helper_event_id", { length: 64 }).notNull(),
    // The event id actually queried for signUps after lastEventId resolution (for
    // recurring/channel events this differs from raidHelperEventId). Debugging aid only
    // — never used for correlation/joins.
    resolvedEventId: varchar("resolved_event_id", { length: 64 }).notNull(),
    checkpoint: snapshotCheckpointEnum("checkpoint").notNull(),
    // The ideal target time this checkpoint represents (startTime - offset), independent
    // of when it was actually captured. Lets a late/catch-up capture stay honestly labeled.
    targetTime: timestamp("target_time", { withTimezone: true }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    // Denormalized copy of the raid's startTime for time-series queries without a live
    // Raid Helper call or a raid_plan join.
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    signUpCount: integer("sign_up_count").notNull(),
    signups: jsonb("signups").$type<RaidHelperSignupSnapshotEntry[]>().notNull(),
    title: varchar("title", { length: 256 }),
    channelName: varchar("channel_name", { length: 128 }),
    // Stable, rename-proof unlike channelName — kept alongside it rather than instead
    // of it since channelName is what's actually useful for zone-text parsing.
    channelId: varchar("channel_id", { length: 64 }),
    // The event's linked SoftRes raid id, if any. Preferred zone-resolution source
    // (see resolveSnapshotZone) since it reads SoftRes's own structured instance data
    // rather than guessing from title text.
    softresId: varchar("softres_id", { length: 64 }),
    // Raid Helper's recurring-series id, distinct from raidHelperEventId/resolvedEventId.
    // Not consumed anywhere yet — captured now (cheap, same migration) because it's the
    // field flagged as the real fix for the known id-reuse limitation documented on
    // raidHelperSignupSnapshotSchedule below, so it doesn't need a second migration
    // whenever that gets addressed.
    scheduledId: varchar("scheduled_id", { length: 64 }),
    zone: varchar("zone", { length: 64 }),
    // "softres" | "title_parse" — which resolution tier produced `zone`, so downstream
    // consumers (e.g. raid<->event match scoring) can trust a softres-sourced zone more
    // than a text-parsed guess. Null iff zone is null.
    zoneSource: varchar("zone_source", { length: 16 }),
  },
  (table) => ({
    eventCheckpointStartIdx: uniqueIndex(
      "raid_helper_signup_snapshot__event_checkpoint_start_idx",
    ).on(table.raidHelperEventId, table.checkpoint, table.startTime),
    raidHelperEventIdIdx: index("raid_helper_signup_snapshot__raid_helper_event_id_idx").on(
      table.raidHelperEventId,
    ),
    startTimeIdx: index("raid_helper_signup_snapshot__start_time_idx").on(table.startTime),
  }),
);

/**
 * Tracks a checkpoint's currently-pending QStash delayed message, if any — a distinct
 * state from "has this checkpoint been captured" (raidHelperSignupSnapshots above),
 * since with QStash we're actively committing a scheduled delivery rather than just
 * polling. Lets the discovery poll detect a same-day raid reschedule (scheduledForStartTime
 * no longer matches the event's current startTime) and cancel+redo the pending message,
 * instead of firing capture at the wrong time.
 *
 * Row lifecycle: created when a checkpoint is scheduled, deleted by the capture route on
 * successful capture (or by the discovery poll when cancelling a stale/mismatched
 * schedule). A leftover row after its checkpoint is already captured is harmless — every
 * consumer checks the snapshot table first — see decideCheckpointAction's "skip-captured"
 * branch, which repairs this case rather than treating it as an error.
 *
 * KNOWN LIMITATION, deliberately unresolved: unlike raidHelperSignupSnapshots, this
 * table's uniqueness is (raidHelperEventId, checkpoint) only — it assumes at most one
 * *pending* schedule can exist per event+checkpoint at a time. That's true as long as
 * Raid Helper's events-list `id` identifies a single occurrence, which is what's
 * actually observed for this guild (verified empirically: every currently-listed event
 * resolves directly, none need `lastEventId` indirection — see raidHelperEventId's
 * comment on the snapshot table above). If Raid Helper's `id` were ever reused across
 * occurrences of a genuinely recurring event (the `scheduledId` field on posted events
 * suggests this is a supported feature, just not one this guild currently triggers),
 * this table would conflate two occurrences' schedules into one row — the discovery poll
 * would see the new occurrence's startTime as "the same event rescheduled" and cancel
 * the still-valid pending message for the other occurrence instead of tracking both
 * independently. A correct fix needs occurrence identity in the key, but the events-list
 * endpoint alone can't distinguish "this event genuinely moved" from "this is actually a
 * different occurrence reusing the same id" — resolving that reliably needs a full
 * detail fetch (for `resolvedEventId`) on every event on every poll, not just ones with
 * something due, a real cost increase deliberately not taken on for a scenario that
 * doesn't currently occur.
 */
export const raidHelperSignupSnapshotSchedule = tableCreator(
  "raid_helper_signup_snapshot_schedule",
  {
    ...IdPkAsUUID,
    raidHelperEventId: varchar("raid_helper_event_id", { length: 64 }).notNull(),
    checkpoint: snapshotCheckpointEnum("checkpoint").notNull(),
    qstashMessageId: varchar("qstash_message_id", { length: 128 }).notNull(),
    // The event's startTime as of the poll that scheduled this message — compared
    // against the event's *current* startTime on each discovery poll to detect a drift.
    scheduledForStartTime: timestamp("scheduled_for_start_time", { withTimezone: true }).notNull(),
    targetTime: timestamp("target_time", { withTimezone: true }).notNull(),
    ...DefaultTimestamps, // updatedAt bumps for free on a reschedule — a cheap audit trail
  },
  (table) => ({
    // No standalone raidHelperEventId index: every query filters by raidHelperEventId
    // IN (...), already served by this composite index's leftmost column.
    eventCheckpointIdx: uniqueIndex(
      "raid_helper_signup_snapshot_schedule__event_checkpoint_idx",
    ).on(table.raidHelperEventId, table.checkpoint),
  }),
);
