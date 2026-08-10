import { NextResponse } from "next/server";
import { inArray, eq, and } from "drizzle-orm";
import { logger } from "~/lib/logger";
import { env } from "~/env";
import { db } from "~/server/db";
import { raidHelperSignupSnapshots, raidHelperSignupSnapshotSchedule } from "~/server/db/schema";
import { verifyQstashRequest } from "~/server/services/qstash-verify";
import { fetchScheduledEvents } from "~/server/services/raid-helper-client";
import { qstashClient } from "~/server/services/qstash-client";
import { captureSnapshot } from "~/server/services/raid-helper-snapshot-capture";
import {
  SNAPSHOT_CHECKPOINTS,
  GRACE_WINDOW_MS,
  decideCheckpointAction,
  type SnapshotCheckpoint,
  type ScheduledState,
} from "~/server/services/raid-helper-snapshot-checkpoints";

// Cron-triggered-function duration limits apply the same way to QStash-triggered ones.
export const maxDuration = 60;

async function cancelQstashMessage(messageId: string) {
  try {
    await qstashClient.messages.cancel(messageId);
  } catch (err) {
    // Best-effort: the message may already have been delivered or expired by the time
    // we try to cancel it — that's fine, not an error worth failing the poll over.
    logger.warn(
      { err, messageId },
      "Failed to cancel QStash message (likely already delivered/expired)",
    );
  }
}

async function deleteScheduleRow(
  raidHelperEventId: string,
  checkpoint: SnapshotCheckpoint,
  qstashMessageId: string,
) {
  // Scoped to the specific generation being cleaned up, not just (event, checkpoint):
  // `stale` was read from a DB snapshot taken earlier in this invocation, before any
  // awaits (the Raid Helper fetch, captureSnapshot's own work). A concurrent discovery
  // invocation — QStash's at-least-once delivery retrying this same schedule after a
  // timeout is the realistic trigger, not just theoretical overlap — can install a fresh
  // replacement schedule row for this exact (event, checkpoint) in that gap. Deleting by
  // (event, checkpoint) alone would blow away that valid replacement out from under it,
  // permanently missing its checkpoint once the grace window expires. Matching on
  // qstashMessageId too makes the delete a no-op if the row has already moved on.
  await db
    .delete(raidHelperSignupSnapshotSchedule)
    .where(
      and(
        eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, raidHelperEventId),
        eq(raidHelperSignupSnapshotSchedule.checkpoint, checkpoint),
        eq(raidHelperSignupSnapshotSchedule.qstashMessageId, qstashMessageId),
      ),
    );
}

async function cleanupStaleSchedule(
  raidHelperEventId: string,
  checkpoint: SnapshotCheckpoint,
  stale: ScheduledState,
) {
  await cancelQstashMessage(stale.qstashMessageId);
  await deleteScheduleRow(raidHelperEventId, checkpoint, stale.qstashMessageId);
}

export async function POST(request: Request) {
  const verification = await verifyQstashRequest(request);
  if (!verification.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.NEXT_PUBLIC_APP_URL) {
    logger.error("NEXT_PUBLIC_APP_URL is not set; cannot construct the capture route destination");
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, { status: 500 });
  }
  const captureRouteUrl = new URL(
    "/api/qstash/raid-helper-capture",
    env.NEXT_PUBLIC_APP_URL,
  ).toString();

  try {
    const now = new Date();
    const allEvents = await fetchScheduledEvents();
    // Cheap prefilter: drop events whose latest possible due window (0h + GRACE_WINDOW_MS)
    // has already closed, before touching the DB.
    const events = allEvents.filter((e) => e.startTime * 1000 + GRACE_WINDOW_MS >= now.getTime());

    const summary = {
      eventsConsidered: events.length,
      scheduled: 0,
      rescheduled: 0,
      capturedNow: 0,
      skippedMissed: 0,
      noop: 0,
      errors: [] as Array<{ raidHelperEventId: string; checkpoint: string; error: string }>,
    };

    if (events.length === 0) {
      return NextResponse.json(summary);
    }

    const eventIds = events.map((e) => e.id);

    const snapshotRows = await db
      .select({
        raidHelperEventId: raidHelperSignupSnapshots.raidHelperEventId,
        checkpoint: raidHelperSignupSnapshots.checkpoint,
        startTime: raidHelperSignupSnapshots.startTime,
      })
      .from(raidHelperSignupSnapshots)
      .where(inArray(raidHelperSignupSnapshots.raidHelperEventId, eventIds));

    // Keyed by the *set* of startTimes captured for a checkpoint, not just the last one
    // seen: a reschedule can legitimately leave more than one row for the same (event,
    // checkpoint) — one from before the move, one from after (see the schema comment on
    // raidHelperSignupSnapshots for why startTime is part of its unique key). The query
    // below has no ORDER BY, so a Map keyed only by checkpoint would silently pick
    // whichever row Postgres happened to return last — an arbitrary one, not necessarily
    // the one matching the event's *current* startTime. Tracking every captured
    // startTime and checking membership avoids depending on row order entirely.
    const capturedByEvent = new Map<string, Map<SnapshotCheckpoint, Set<number>>>();
    for (const row of snapshotRows) {
      const map =
        capturedByEvent.get(row.raidHelperEventId) ?? new Map<SnapshotCheckpoint, Set<number>>();
      const startTimes = map.get(row.checkpoint) ?? new Set<number>();
      startTimes.add(row.startTime.getTime());
      map.set(row.checkpoint, startTimes);
      capturedByEvent.set(row.raidHelperEventId, map);
    }

    const scheduleRows = await db
      .select()
      .from(raidHelperSignupSnapshotSchedule)
      .where(inArray(raidHelperSignupSnapshotSchedule.raidHelperEventId, eventIds));

    const scheduledByEvent = new Map<string, Map<SnapshotCheckpoint, ScheduledState>>();
    for (const row of scheduleRows) {
      const map =
        scheduledByEvent.get(row.raidHelperEventId) ??
        new Map<SnapshotCheckpoint, ScheduledState>();
      map.set(row.checkpoint, {
        qstashMessageId: row.qstashMessageId,
        scheduledForStartTime: row.scheduledForStartTime,
      });
      scheduledByEvent.set(row.raidHelperEventId, map);
    }

    for (const event of events) {
      const currentStartTime = new Date(event.startTime * 1000);
      const captured = capturedByEvent.get(event.id) ?? new Map<SnapshotCheckpoint, Set<number>>();
      const scheduled =
        scheduledByEvent.get(event.id) ?? new Map<SnapshotCheckpoint, ScheduledState>();

      for (const checkpoint of SNAPSHOT_CHECKPOINTS) {
        const capturedStartTimes = captured.get(checkpoint);
        const decision = decideCheckpointAction({
          checkpoint,
          now,
          currentStartTime,
          captured: capturedStartTimes?.has(currentStartTime.getTime()) ?? false,
          scheduled: scheduled.get(checkpoint) ?? null,
        });

        try {
          switch (decision.action) {
            case "noop": {
              summary.noop += 1;
              break;
            }

            case "skip-captured": {
              if (decision.staleSchedule) {
                await cleanupStaleSchedule(event.id, checkpoint, decision.staleSchedule);
              }
              break;
            }

            case "skip-missed": {
              summary.skippedMissed += 1;
              if (decision.staleSchedule) {
                await cleanupStaleSchedule(event.id, checkpoint, decision.staleSchedule);
              }
              break;
            }

            case "capture-now": {
              // This decision was timed against currentStartTime, as fetched by this
              // poll's own event-list call above — but captureSnapshot makes its own
              // separate fetchEventDetail call, which can return a startTime that's
              // already moved on if the raid was rescheduled in between. Without
              // validateStartTime, that fresher (but decision-invalidating) startTime
              // would still get inserted — prematurely claiming the corrected
              // occurrence's unique checkpoint slot before its real target time and
              // permanently suppressing the correctly-timed capture that should happen
              // later. Aborting on a mismatch leaves it for the next poll, which will
              // fetch the corrected startTime fresh and decide the right action for it.
              const result = await captureSnapshot({
                raidHelperEventId: event.id,
                checkpoint,
                validateStartTime: (liveStartTime) =>
                  liveStartTime.getTime() === currentStartTime.getTime(),
              });
              if (!result.aborted) {
                summary.capturedNow += 1;
              }
              if (decision.staleSchedule) {
                await cleanupStaleSchedule(event.id, checkpoint, decision.staleSchedule);
              }
              break;
            }

            case "schedule": {
              const published = await qstashClient.publishJSON({
                url: captureRouteUrl,
                // targetTime rides along so the capture route can tell a stale/superseded
                // delivery (one whose old QStash message beat cancellation after a
                // reschedule) apart from the currently-active one — see the capture
                // route's staleness check.
                body: {
                  raidHelperEventId: event.id,
                  checkpoint,
                  targetTime: decision.targetTime.toISOString(),
                },
                notBefore: Math.floor(decision.targetTime.getTime() / 1000),
              });
              await db.insert(raidHelperSignupSnapshotSchedule).values({
                raidHelperEventId: event.id,
                checkpoint,
                qstashMessageId: published.messageId,
                scheduledForStartTime: currentStartTime,
                targetTime: decision.targetTime,
              });
              summary.scheduled += 1;
              break;
            }

            case "reschedule": {
              await cancelQstashMessage(decision.staleSchedule.qstashMessageId);
              const published = await qstashClient.publishJSON({
                url: captureRouteUrl,
                body: {
                  raidHelperEventId: event.id,
                  checkpoint,
                  targetTime: decision.targetTime.toISOString(),
                },
                notBefore: Math.floor(decision.targetTime.getTime() / 1000),
              });
              await db
                .update(raidHelperSignupSnapshotSchedule)
                .set({
                  qstashMessageId: published.messageId,
                  scheduledForStartTime: currentStartTime,
                  targetTime: decision.targetTime,
                })
                .where(
                  and(
                    eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, event.id),
                    eq(raidHelperSignupSnapshotSchedule.checkpoint, checkpoint),
                  ),
                );
              summary.rescheduled += 1;
              break;
            }
          }
        } catch (err) {
          logger.error(
            { err, raidHelperEventId: event.id, checkpoint, action: decision.action },
            "Failed to act on Raid Helper snapshot checkpoint decision",
          );
          summary.errors.push({
            raidHelperEventId: event.id,
            checkpoint,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    logger.error({ err: error }, "Raid Helper snapshot discovery poll failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
