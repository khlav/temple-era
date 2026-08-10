import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { raidHelperSignupSnapshotSchedule } from "~/server/db/schema";
import { verifyQstashRequest } from "~/server/services/qstash-verify";
import { captureSnapshot } from "~/server/services/raid-helper-snapshot-capture";
import {
  SNAPSHOT_CHECKPOINTS,
  type SnapshotCheckpoint,
} from "~/server/services/raid-helper-snapshot-checkpoints";

// Cron-triggered-function duration limits apply the same way to QStash-triggered ones.
export const maxDuration = 60;

interface CapturePayload {
  raidHelperEventId: string;
  checkpoint: SnapshotCheckpoint;
  targetTime: string;
}

function isCapturePayload(body: unknown): body is CapturePayload {
  if (typeof body !== "object" || body === null) return false;
  const { raidHelperEventId, checkpoint, targetTime } = body as Record<string, unknown>;
  return (
    typeof raidHelperEventId === "string" &&
    typeof checkpoint === "string" &&
    (SNAPSHOT_CHECKPOINTS as readonly string[]).includes(checkpoint) &&
    typeof targetTime === "string" &&
    !Number.isNaN(Date.parse(targetTime))
  );
}

export async function POST(request: Request) {
  const verification = await verifyQstashRequest(request);
  if (!verification.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verification.body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isCapturePayload(payload)) {
    return NextResponse.json(
      { error: "Expected { raidHelperEventId, checkpoint, targetTime }" },
      { status: 400 },
    );
  }

  try {
    // Stale-delivery guard: a QStash message that's already in flight when a raid gets
    // rescheduled can still be delivered after cancelQstashMessage() was called for it
    // (cancellation isn't atomic with in-flight delivery). If the currently-active
    // tracking row's targetTime doesn't match what this delivery was scheduled for, it's
    // a superseded generation — capturing now would insert at the wrong real-world
    // moment relative to the checkpoint's corrected target, and that premature row would
    // then block the correctly-timed capture via the unique constraint. Return 200 (not
    // an error) so QStash doesn't retry a delivery we're intentionally discarding, and
    // leave the tracking row alone — it belongs to the active generation, which cleans
    // up after itself when it fires.
    //
    // A *missing* row is treated the same as a mismatch, not "safe to proceed": the row
    // only disappears once some delivery has already captured this exact
    // (event, checkpoint, startTime) successfully (see the delete below), so a missing
    // row means either this is a harmless duplicate of an already-processed delivery
    // (captureSnapshot's own uniqueness makes that a no-op anyway — this just skips the
    // redundant Raid Helper fetch) or a genuinely stale one from an earlier generation.
    // Either way there's nothing useful left for this delivery to do.
    const [activeSchedule] = await db
      .select({
        targetTime: raidHelperSignupSnapshotSchedule.targetTime,
        scheduledForStartTime: raidHelperSignupSnapshotSchedule.scheduledForStartTime,
      })
      .from(raidHelperSignupSnapshotSchedule)
      .where(
        and(
          eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, payload.raidHelperEventId),
          eq(raidHelperSignupSnapshotSchedule.checkpoint, payload.checkpoint),
        ),
      );

    const payloadTargetTime = new Date(payload.targetTime);
    if (!activeSchedule || activeSchedule.targetTime.getTime() !== payloadTargetTime.getTime()) {
      logger.warn(
        { raidHelperEventId: payload.raidHelperEventId, checkpoint: payload.checkpoint },
        "Discarding stale or already-handled QStash delivery",
      );
      return NextResponse.json({ captured: false, stale: true });
    }

    // Second, narrower check against *reality* rather than our own bookkeeping: the
    // check above only proves this delivery matches our tracking row as of a moment
    // ago — it can't catch a reschedule landing during captureSnapshot's own (slow,
    // network-bound) Raid Helper fetch, nor a row that's simply stale because no
    // discovery poll has reconciled it yet even though it still matched above. Comparing
    // the *freshly fetched* live startTime against what this delivery's generation was
    // scheduled under closes both: if Raid Helper's actual current startTime no longer
    // matches, abort without inserting and leave the tracking row alone — the next
    // discovery poll will detect the drift (against live data, same as always) and
    // schedule the correct capture from there.
    //
    // Third, narrowest check: re-select the tracking row (locked `for update`) inside
    // the same transaction as the insert, immediately before it. Closes the last sliver
    // the check above can't — a reschedule landing between that check passing and the
    // insert actually committing, which is otherwise just small (a synchronous JS
    // continuation plus one round trip), not zero. A concurrent discovery-route UPDATE
    // to this exact row either commits first (visible here, causing an abort) or blocks
    // until this transaction finishes (real atomicity, not just a smaller window).
    const result = await captureSnapshot({
      raidHelperEventId: payload.raidHelperEventId,
      checkpoint: payload.checkpoint,
      validateStartTime: (liveStartTime) =>
        liveStartTime.getTime() === activeSchedule.scheduledForStartTime.getTime(),
      revalidateBeforeInsert: async (tx, liveStartTime) => {
        const [row] = await tx
          .select({ scheduledForStartTime: raidHelperSignupSnapshotSchedule.scheduledForStartTime })
          .from(raidHelperSignupSnapshotSchedule)
          .where(
            and(
              eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, payload.raidHelperEventId),
              eq(raidHelperSignupSnapshotSchedule.checkpoint, payload.checkpoint),
            ),
          )
          .for("update");
        return row !== undefined && row.scheduledForStartTime.getTime() === liveStartTime.getTime();
      },
    });

    if (result.aborted) {
      logger.warn(
        { raidHelperEventId: payload.raidHelperEventId, checkpoint: payload.checkpoint },
        "Discarding delivery whose assumed start time no longer matches Raid Helper's live data",
      );
      return NextResponse.json({ captured: false, stale: true });
    }

    // Clean up the tracking row only on success, and only if it still matches what we
    // just captured for — a narrower version of the same staleness guard, in case the
    // row was updated to a newer generation between the check above and this delete.
    // QStash's own at-least-once retry is the primary recovery path for a transient
    // failure here — deleting the row on failure would risk the next discovery poll
    // racing a second scheduled message while QStash independently retries this one.
    // Leaving it in place gives one source of truth either way: retries succeed → fine;
    // retries exhaust → the discovery poll's "scheduled, missed" branch picks it up as a
    // clean backstop.
    await db
      .delete(raidHelperSignupSnapshotSchedule)
      .where(
        and(
          eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, payload.raidHelperEventId),
          eq(raidHelperSignupSnapshotSchedule.checkpoint, payload.checkpoint),
          eq(raidHelperSignupSnapshotSchedule.targetTime, payloadTargetTime),
        ),
      );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error, payload }, "Failed to capture Raid Helper signup snapshot");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
