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
}

function isCapturePayload(body: unknown): body is CapturePayload {
  if (typeof body !== "object" || body === null) return false;
  const { raidHelperEventId, checkpoint } = body as Record<string, unknown>;
  return (
    typeof raidHelperEventId === "string" &&
    typeof checkpoint === "string" &&
    (SNAPSHOT_CHECKPOINTS as readonly string[]).includes(checkpoint)
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
      { error: "Expected { raidHelperEventId, checkpoint }" },
      { status: 400 },
    );
  }

  try {
    const result = await captureSnapshot(payload);

    // Clean up the tracking row only on success. QStash's own at-least-once retry is
    // the primary recovery path for a transient failure here — deleting the row on
    // failure would risk the next discovery poll racing a second scheduled message
    // while QStash independently retries this one. Leaving it in place gives one source
    // of truth either way: retries succeed → fine; retries exhaust → the discovery
    // poll's "scheduled, missed" branch picks it up as a clean backstop.
    await db
      .delete(raidHelperSignupSnapshotSchedule)
      .where(
        and(
          eq(raidHelperSignupSnapshotSchedule.raidHelperEventId, payload.raidHelperEventId),
          eq(raidHelperSignupSnapshotSchedule.checkpoint, payload.checkpoint),
        ),
      );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error, payload }, "Failed to capture Raid Helper signup snapshot");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
