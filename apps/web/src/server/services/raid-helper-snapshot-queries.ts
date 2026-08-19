import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
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
