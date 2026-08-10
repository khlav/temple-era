import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { inArray, eq, and } from "drizzle-orm";
import { logger } from "~/lib/logger";
import { env } from "~/env";
import { db } from "~/server/db";
import { raidHelperSignupSnapshots, raidHelperSignupSnapshotSchedule } from "~/server/db/schema";
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

async function deleteScheduleRow(raidHelperEventId: string, checkpoint: SnapshotCheckpoint) {
  await db
    .delete(raidHelperSignupSnapshotSchedule)
    .where(
      and(
        eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, raidHelperEventId),
        eq(raidHelperSignupSnapshotSchedule.checkpoint, checkpoint),
      ),
    );
}

async function cleanupStaleSchedule(
  raidHelperEventId: string,
  checkpoint: SnapshotCheckpoint,
  stale: ScheduledState,
) {
  await cancelQstashMessage(stale.qstashMessageId);
  await deleteScheduleRow(raidHelperEventId, checkpoint);
}

async function handler(_request: Request) {
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
      })
      .from(raidHelperSignupSnapshots)
      .where(inArray(raidHelperSignupSnapshots.raidHelperEventId, eventIds));

    const capturedByEvent = new Map<string, Set<SnapshotCheckpoint>>();
    for (const row of snapshotRows) {
      const set = capturedByEvent.get(row.raidHelperEventId) ?? new Set<SnapshotCheckpoint>();
      set.add(row.checkpoint);
      capturedByEvent.set(row.raidHelperEventId, set);
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
      const captured = capturedByEvent.get(event.id) ?? new Set<SnapshotCheckpoint>();
      const scheduled =
        scheduledByEvent.get(event.id) ?? new Map<SnapshotCheckpoint, ScheduledState>();

      for (const checkpoint of SNAPSHOT_CHECKPOINTS) {
        const decision = decideCheckpointAction({
          checkpoint,
          now,
          currentStartTime,
          captured: captured.has(checkpoint),
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
              await captureSnapshot({ raidHelperEventId: event.id, checkpoint });
              summary.capturedNow += 1;
              if (decision.staleSchedule) {
                await cleanupStaleSchedule(event.id, checkpoint, decision.staleSchedule);
              }
              break;
            }

            case "schedule": {
              const published = await qstashClient.publishJSON({
                url: captureRouteUrl,
                body: { raidHelperEventId: event.id, checkpoint },
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
                body: { raidHelperEventId: event.id, checkpoint },
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

export const POST = verifySignatureAppRouter(handler, {
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});
