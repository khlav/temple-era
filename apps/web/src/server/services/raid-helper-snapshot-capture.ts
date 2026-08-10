import { db } from "~/server/db";
import { raidHelperSignupSnapshots } from "~/server/db/schema";
import { fetchEventDetail } from "~/server/services/raid-helper-client";
import {
  computeTargetTime,
  type SnapshotCheckpoint,
} from "~/server/services/raid-helper-snapshot-checkpoints";

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
 */
export async function captureSnapshot(params: {
  raidHelperEventId: string;
  checkpoint: SnapshotCheckpoint;
}): Promise<{ captured: boolean }> {
  const detail = await fetchEventDetail(params.raidHelperEventId);
  const startTime = new Date(detail.startTime * 1000);
  const targetTime = computeTargetTime(startTime, params.checkpoint);
  const signups = detail.signUps ?? [];

  const inserted = await db
    .insert(raidHelperSignupSnapshots)
    .values({
      raidHelperEventId: params.raidHelperEventId,
      resolvedEventId: detail.id,
      checkpoint: params.checkpoint,
      targetTime,
      startTime,
      signUpCount: signups.length,
      signups,
    })
    .onConflictDoNothing({
      target: [raidHelperSignupSnapshots.raidHelperEventId, raidHelperSignupSnapshots.checkpoint],
    })
    .returning({ id: raidHelperSignupSnapshots.id });

  return { captured: inserted.length > 0 };
}
