import { db } from "~/server/db";
import { raidHelperSignupSnapshots } from "~/server/db/schema";
import { fetchEventDetail, type RaidHelperEventDetail } from "~/server/services/raid-helper-client";
import {
  computeTargetTime,
  type SnapshotCheckpoint,
} from "~/server/services/raid-helper-snapshot-checkpoints";
import { fetchSoftResRaidData } from "~/server/api/softres-client";
import { getZoneForInstance, resolveSoftResZoneId, parseZoneFromEventText } from "~/lib/raid-zones";
import { logger } from "~/lib/logger";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolves a snapshot's zone, preferring the event's linked SoftRes raid (structured
 * `instance`/`instances` data) over guessing from title/channel text (TEMPLE-84). The
 * SoftRes fetch is a third-party network call — any failure (bad id, SoftRes down)
 * falls through to text parsing rather than failing the capture.
 */
async function resolveSnapshotZone(
  detail: Pick<RaidHelperEventDetail, "title" | "displayTitle" | "channelName" | "softresId">,
): Promise<{ zone: string | undefined; zoneSource: "softres" | "title_parse" | undefined }> {
  if (detail.softresId) {
    try {
      const softResData = await fetchSoftResRaidData(detail.softresId);
      const instanceId = resolveSoftResZoneId(softResData.instance, softResData.instances);
      const zone = instanceId ? getZoneForInstance(instanceId) : undefined;
      if (zone) return { zone, zoneSource: "softres" };
    } catch (err) {
      logger.error(
        { err, softresId: detail.softresId },
        "Failed to resolve snapshot zone from SoftRes, falling back to title parsing",
      );
    }
  }

  const zone = parseZoneFromEventText(detail.displayTitle ?? detail.title, detail.channelName);
  return { zone, zoneSource: zone ? "title_parse" : undefined };
}

/**
 * Fetches the current signup state for an event and inserts a snapshot row for one
 * checkpoint. Shared by the discovery route (immediate/overdue captures) and the
 * capture route (normal QStash-scheduled fire) so the fetch+insert logic exists once.
 *
 * Deliberately takes only the checkpoint identity, not a pre-computed targetTime/
 * startTime — it re-derives both fresh from fetchEventDetail rather than trusting a
 * value baked into a QStash payload at schedule time, which is more honest (a
 * checkpoint's target is relative to the raid's *actual* start time) and keeps that
 * payload minimal.
 *
 * `validateStartTime`, if given, runs against the freshly-fetched *live* startTime
 * after the (slow, network-bound) fetch but before the insert commits — closing a race
 * the capture route's own pre-fetch staleness check can't: a reschedule can land during
 * this function's own fetchEventDetail call, or the caller's tracking row can simply be
 * stale (not yet reconciled by a discovery poll) even though it matched at the time of
 * the pre-check. Comparing against reality (this fetch) rather than only against
 * whatever the caller's own bookkeeping believed closes both variants, not just the
 * narrower one caught before this call. Returning `false` aborts without inserting.
 *
 * `revalidateBeforeInsert`, if given, runs inside the same transaction as the insert,
 * immediately before it — closing the remaining sliver `validateStartTime` can't: the
 * gap between that check passing and the insert actually committing (fetchEventDetail
 * resolving, then a synchronous continuation, then the insert's own round trip). A
 * concurrent discovery poll that reschedules this exact checkpoint in that narrow
 * window would otherwise slip an now-superseded snapshot in alongside the corrected
 * one — the widened (event, checkpoint, startTime) uniqueness key no longer collides on
 * it the way the original (event, checkpoint) key would have. Callers should have this
 * re-select the same tracking row with `.for("update")`, so a concurrent single-
 * statement UPDATE from the discovery route (itself always inside its own implicit
 * transaction) either commits first and is seen here, or blocks until this transaction
 * finishes — real atomicity for same-row writers, not just a smaller window.
 */
export async function captureSnapshot(params: {
  raidHelperEventId: string;
  checkpoint: SnapshotCheckpoint;
  validateStartTime?: (liveStartTime: Date) => boolean;
  revalidateBeforeInsert?: (tx: Transaction, liveStartTime: Date) => Promise<boolean>;
}): Promise<{ captured: boolean; startTime: Date; aborted?: boolean }> {
  const detail = await fetchEventDetail(params.raidHelperEventId);
  const startTime = new Date(detail.startTime * 1000);

  if (params.validateStartTime && !params.validateStartTime(startTime)) {
    return { captured: false, startTime, aborted: true };
  }

  const targetTime = computeTargetTime(startTime, params.checkpoint);
  const signups = detail.signUps ?? [];
  const { zone, zoneSource } = await resolveSnapshotZone(detail);

  const { insertedRows, revalidationFailed } = await db.transaction(async (tx) => {
    if (params.revalidateBeforeInsert && !(await params.revalidateBeforeInsert(tx, startTime))) {
      return { insertedRows: [], revalidationFailed: true };
    }

    const rows = await tx
      .insert(raidHelperSignupSnapshots)
      .values({
        raidHelperEventId: params.raidHelperEventId,
        resolvedEventId: detail.id,
        checkpoint: params.checkpoint,
        targetTime,
        startTime,
        signUpCount: signups.length,
        signups,
        title: detail.displayTitle ?? detail.title ?? null,
        channelName: detail.channelName ?? null,
        channelId: detail.channelId ?? null,
        softresId: detail.softresId ?? null,
        scheduledId: detail.scheduledId ?? null,
        zone: zone ?? null,
        zoneSource: zoneSource ?? null,
      })
      .onConflictDoNothing({
        target: [
          raidHelperSignupSnapshots.raidHelperEventId,
          raidHelperSignupSnapshots.checkpoint,
          raidHelperSignupSnapshots.startTime,
        ],
      })
      .returning({ id: raidHelperSignupSnapshots.id });

    return { insertedRows: rows, revalidationFailed: false };
  });

  if (revalidationFailed) {
    return { captured: false, startTime, aborted: true };
  }

  return { captured: insertedRows.length > 0, startTime };
}
