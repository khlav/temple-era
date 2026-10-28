import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { raidHelperSignupSnapshots } from "~/server/db/schema";

export type LatestSignupSnapshot = typeof raidHelperSignupSnapshots.$inferSelect;

/**
 * Canonical "latest snapshot per Raid Helper event occurrence" read path (TEMPLE-84).
 * An occurrence is (raidHelperEventId, startTime); "latest" is the highest capturedAt
 * within that occurrence. This is the single access path everything else — raid<->event
 * matching, the review UI, reporting joins — should read through rather than
 * re-deriving "latest" independently.
 */
export async function getLatestSignupSnapshotsByOccurrence(
  filter: {
    startTimeFrom?: Date;
    startTimeTo?: Date;
    raidHelperEventIds?: string[];
  } = {},
): Promise<LatestSignupSnapshot[]> {
  const conditions = [
    filter.startTimeFrom
      ? gte(raidHelperSignupSnapshots.startTime, filter.startTimeFrom)
      : undefined,
    filter.startTimeTo ? lte(raidHelperSignupSnapshots.startTime, filter.startTimeTo) : undefined,
    filter.raidHelperEventIds?.length
      ? inArray(raidHelperSignupSnapshots.raidHelperEventId, filter.raidHelperEventIds)
      : undefined,
  ].filter((c) => c !== undefined);

  return db
    .selectDistinctOn(
      [raidHelperSignupSnapshots.raidHelperEventId, raidHelperSignupSnapshots.startTime],
      {
        id: raidHelperSignupSnapshots.id,
        raidHelperEventId: raidHelperSignupSnapshots.raidHelperEventId,
        resolvedEventId: raidHelperSignupSnapshots.resolvedEventId,
        checkpoint: raidHelperSignupSnapshots.checkpoint,
        targetTime: raidHelperSignupSnapshots.targetTime,
        capturedAt: raidHelperSignupSnapshots.capturedAt,
        startTime: raidHelperSignupSnapshots.startTime,
        signUpCount: raidHelperSignupSnapshots.signUpCount,
        signups: raidHelperSignupSnapshots.signups,
        title: raidHelperSignupSnapshots.title,
        channelName: raidHelperSignupSnapshots.channelName,
        channelId: raidHelperSignupSnapshots.channelId,
        softresId: raidHelperSignupSnapshots.softresId,
        scheduledId: raidHelperSignupSnapshots.scheduledId,
        zone: raidHelperSignupSnapshots.zone,
        zoneSource: raidHelperSignupSnapshots.zoneSource,
      },
    )
    .from(raidHelperSignupSnapshots)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      raidHelperSignupSnapshots.raidHelperEventId,
      raidHelperSignupSnapshots.startTime,
      desc(raidHelperSignupSnapshots.capturedAt),
    );
}

/**
 * Latest snapshot for a single occurrence, or undefined if none has been captured yet.
 */
export async function getLatestSignupSnapshotForOccurrence(
  raidHelperEventId: string,
  startTime: Date,
): Promise<LatestSignupSnapshot | undefined> {
  const rows = await getLatestSignupSnapshotsByOccurrence({
    raidHelperEventIds: [raidHelperEventId],
  });
  return rows.find((row) => row.startTime.getTime() === startTime.getTime());
}

/**
 * Every captured checkpoint for one occurrence, oldest first, no dedup — the opposite of
 * the latest-only helpers above. Backs the Signup Timeline tab (TEMPLE-97), which needs
 * the full checkpoint history rather than a single "current" snapshot.
 */
/** One signup inside a snapshot, cut to the fields signup matching reads. */
export interface SignupForMatching {
  userId: string;
  name: string;
  className: string;
  specName: string;
}

export interface SignupHistoryForMatchingRow {
  raidHelperEventId: string;
  startTime: Date;
  checkpoint: LatestSignupSnapshot["checkpoint"];
  signups: SignupForMatching[];
}

/**
 * Every snapshot of several occurrences in one query, oldest capture first, carrying only what
 * signup matching reads. Achievement evaluation matches a whole signup history on every run; one
 * query per occurrence, each returning every column, made the snapshot table its largest read by
 * bytes (TEMPLE-161). A full `signups` entry also carries role, status, position and entry time,
 * about 45% of each row on the wire, so they're dropped in SQL.
 */
export async function getSignupHistoryForMatching(
  occurrences: { raidHelperEventId: string; startTime: Date }[],
): Promise<SignupHistoryForMatchingRow[]> {
  if (occurrences.length === 0) return [];
  const rows = await db
    .select({
      raidHelperEventId: raidHelperSignupSnapshots.raidHelperEventId,
      startTime: raidHelperSignupSnapshots.startTime,
      checkpoint: raidHelperSignupSnapshots.checkpoint,
      signups: sql<SignupForMatching[] | string>`(
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'userId', e -> 'userId',
              'name', e -> 'name',
              'className', e -> 'className',
              'specName', e -> 'specName'
            ) ORDER BY ord
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(${raidHelperSignupSnapshots.signups}) WITH ORDINALITY AS entry(e, ord)
      )`,
    })
    .from(raidHelperSignupSnapshots)
    .where(
      or(
        ...occurrences.map((o) =>
          and(
            eq(raidHelperSignupSnapshots.raidHelperEventId, o.raidHelperEventId),
            eq(raidHelperSignupSnapshots.startTime, o.startTime),
          ),
        ),
      ),
    )
    .orderBy(asc(raidHelperSignupSnapshots.capturedAt));

  return rows.map((row) => ({
    ...row,
    signups: typeof row.signups === "string" ? JSON.parse(row.signups) : row.signups,
  }));
}

export async function getSignupSnapshotHistoryForOccurrence(
  raidHelperEventId: string,
  startTime: Date,
): Promise<LatestSignupSnapshot[]> {
  return db
    .select()
    .from(raidHelperSignupSnapshots)
    .where(
      and(
        eq(raidHelperSignupSnapshots.raidHelperEventId, raidHelperEventId),
        eq(raidHelperSignupSnapshots.startTime, startTime),
      ),
    )
    .orderBy(asc(raidHelperSignupSnapshots.capturedAt));
}
