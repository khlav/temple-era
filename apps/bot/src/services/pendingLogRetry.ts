import { type AnyThreadChannel } from "discord.js";
import { type CreateRaidRequest } from "@temple-era/contracts";
import { logger } from "../config/logger.js";
import { requestRaidCreation } from "./raidCreation.js";
import { raidThreadName } from "../utils/threadName.js";

/**
 * A Warcraft Logs link is often posted at the pull, before the raid's first boss. Warcraft Logs
 * has no zone for such a report, so there is no raid to create yet — but there will be, usually
 * within the hour.
 *
 * Rather than leaving the raid lead with nothing (what happened to the 2026-11-18 Naxx log: a 500,
 * no thread, no message, noticed a day later), the bot opens the thread straight away, says it is
 * waiting, and retries on a timer. The first attempt that succeeds posts the raid link in that
 * same thread, exactly as the immediate path would have.
 *
 * The timer is in-process. A bot restart inside the hour drops any pending retry — the thread then
 * keeps its "I'll check back" message with no follow-up. That is the known trade-off of not giving
 * the bot a durable store; the window is short and bot restarts are rare (a secret sync or a
 * deploy).
 */
export const RETRY_INTERVAL_MS = 15 * 60 * 1000;
export const RETRY_WINDOW_MS = 60 * 60 * 1000;
export const MAX_ATTEMPTS = Math.floor(RETRY_WINDOW_MS / RETRY_INTERVAL_MS);

export const WAITING_MESSAGE =
  "⏳ No boss data in this log yet — Warcraft Logs hasn't seen a fight. " +
  "I'll check every 15 minutes for the next hour and post the raid link as soon as it lands.";

export const GAVE_UP_MESSAGE =
  "⏰ Still no boss data after an hour, so no raid was created. " +
  "Post the log link again once the raid is underway.";

/** Pending retries, keyed by the Discord message the log was posted in. */
const pending = new Map<string, NodeJS.Timeout>();

/**
 * Drops any retry pending for a Discord message, and says whether there was one. The message
 * handler calls this when the raid lead edits the link inside Discord's 15-minute window: the edit
 * goes to `update-raid`, which answers "No raid found" because a pending log has written no row, so
 * without this the loop would go on to create the raid from the *replaced* link.
 */
export function cancelPendingLogRetry(messageId: string): boolean {
  const timer = pending.get(messageId);
  if (!timer) return false;
  clearTimeout(timer);
  pending.delete(messageId);
  return true;
}

/** Visible for tests and for shutdown; cancels every scheduled retry. */
export function cancelAllPendingLogRetries(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
}

export function pendingLogRetryCount(): number {
  return pending.size;
}

async function send(thread: AnyThreadChannel, content: string, context: Record<string, unknown>) {
  try {
    await thread.send(content);
  } catch (error) {
    logger.error(
      { ...context, error: error instanceof Error ? error.message : String(error) },
      "Could not post to pending-log thread",
    );
  }
}

async function attempt(
  thread: AnyThreadChannel,
  body: CreateRaidRequest,
  attemptNumber: number,
  context: Record<string, unknown>,
): Promise<void> {
  const attemptContext = { ...context, attempt: attemptNumber, maxAttempts: MAX_ATTEMPTS };
  logger.info(attemptContext, "Retrying raid creation for a log with no boss data yet");

  const outcome = await requestRaidCreation(body, attemptContext);

  if (outcome.kind === "created") {
    logger.info(
      { ...attemptContext, raidId: outcome.raidId, raidName: outcome.raidName },
      "Pending log resolved into a raid",
    );
    // Name the thread properly now that the raid exists — it was opened before anything but the
    // report title was known.
    const renamed = outcome.raidName ? raidThreadName(outcome.raidName) : null;
    if (renamed && thread.name !== renamed) {
      try {
        await thread.setName(renamed);
      } catch (error) {
        logger.error(
          { ...attemptContext, error: error instanceof Error ? error.message : String(error) },
          "Could not rename pending-log thread",
        );
      }
    }
    await send(thread, outcome.raidUrl, attemptContext);
    return;
  }

  if (outcome.kind === "failed" && !outcome.retryable) {
    logger.error({ ...attemptContext, error: outcome.error }, "Pending log retry failed");
    await send(thread, `❌ Could not create the raid: ${outcome.error}`, attemptContext);
    return;
  }

  // Either Warcraft Logs still has nothing, or Temple was briefly unreachable. Both are worth
  // another look while the window is open.
  if (attemptNumber >= MAX_ATTEMPTS) {
    if (outcome.kind === "failed") {
      logger.error(
        { ...attemptContext, error: outcome.error },
        "Giving up after repeated unreachable Temple API",
      );
      await send(thread, `❌ Could not create the raid: ${outcome.error}`, attemptContext);
      return;
    }
    logger.warn(attemptContext, "Giving up on a log with no boss data");
    await send(thread, GAVE_UP_MESSAGE, attemptContext);
    return;
  }

  schedule(thread, body, attemptNumber + 1, context);
}

function schedule(
  thread: AnyThreadChannel,
  body: CreateRaidRequest,
  attemptNumber: number,
  context: Record<string, unknown>,
): void {
  const key = body.discordMessageId ?? thread.id;
  const timer = setTimeout(() => {
    pending.delete(key);
    // An unhandled rejection is fatal for this process (see the bot's logger setup), which would
    // take the gateway connection down over one bad attempt.
    void attempt(thread, body, attemptNumber, context).catch((error: unknown) => {
      logger.error(
        {
          ...context,
          attempt: attemptNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        "Pending-log retry threw unexpectedly",
      );
    });
  }, RETRY_INTERVAL_MS);
  pending.set(key, timer);
}

/**
 * Opens the retry loop for a log Warcraft Logs has no boss data for yet. The caller has already
 * created the thread; this posts the waiting message and schedules the first retry.
 */
export function startPendingLogRetries(
  thread: AnyThreadChannel,
  body: CreateRaidRequest,
  context: Record<string, unknown> = {},
): void {
  const key = body.discordMessageId ?? thread.id;
  if (pending.has(key)) {
    logger.debug({ ...context, key }, "Pending log retry already scheduled, skipping");
    return;
  }

  void send(thread, WAITING_MESSAGE, context);
  schedule(thread, body, 1, context);
  logger.info(
    { ...context, intervalMs: RETRY_INTERVAL_MS, maxAttempts: MAX_ATTEMPTS },
    "Waiting for Warcraft Logs to report boss data",
  );
}
