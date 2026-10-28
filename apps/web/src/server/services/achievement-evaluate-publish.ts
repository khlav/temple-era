import { logger } from "~/lib/logger";
import { env } from "~/env";
import { qstashClient } from "~/server/services/qstash-client";

export type AchievementEvaluateTrigger =
  | "raid_log_import"
  | "signup_link_resolved"
  | "bench_updated";

// A raid's import, bench update and signup link usually land within minutes of each other, and
// each used to start its own run, re-reading the whole attendance history of every family in the
// raid (Oct 27: 6 runs for 3 raids, TEMPLE-164). Now every trigger for a raid within one half-hour
// window (on the clock: :00 to :30, :30 to :00) shares a QStash deduplication id, so only the first
// is enqueued, and it is delivered just after the window closes, by which time it sees every write
// from the window. A trigger in a later window gets its own run, so a pair straddling :00 or :30
// still runs twice. Half an hour rather than less because the windows are fixed and a shorter one
// splits more pairs: 15 minutes would have split Oct 27's 14:44 import from its 14:49 bench update.
// Awards therefore land 2 to 32 minutes after an import.
const WINDOW_SECONDS = 30 * 60;
const DELIVERY_GRACE_SECONDS = 2 * 60;

/** The deduplication id and delivery time (unix seconds) for a trigger at `nowMs`. */
export function achievementEvaluateSchedule(raidId: number, nowMs: number) {
  const window = Math.floor(nowMs / 1000 / WINDOW_SECONDS);
  return {
    deduplicationId: `achievement-evaluate-${raidId}-${window}`,
    notBefore: (window + 1) * WINDOW_SECONDS + DELIVERY_GRACE_SECONDS,
  };
}

/** Fire-and-forget publish shared by every raid-creation/raid-log-import call site — never
 *  throws. A publish failure (QStash outage, misconfigured signing key, unset
 *  NEXT_PUBLIC_APP_URL) must not fail the raid write itself; `POST /api/v1/raids` in
 *  particular is Templar-frozen and must not throw at all, mirroring the discipline
 *  `runPostRaidCreationSignupLinking` already follows on the adjacent call. */
export async function publishAchievementEvaluate(
  raidId: number,
  trigger: AchievementEvaluateTrigger,
): Promise<void> {
  try {
    if (!env.NEXT_PUBLIC_APP_URL) {
      logger.warn("NEXT_PUBLIC_APP_URL is not set; skipping achievement-evaluate publish");
      return;
    }
    // A deduplicated publish is accepted but not enqueued, so the dropped trigger's name never
    // reaches the handler, which only logs it.
    await qstashClient.publishJSON({
      url: new URL("/api/qstash/achievement-evaluate", env.NEXT_PUBLIC_APP_URL).toString(),
      body: { raidId, trigger },
      ...achievementEvaluateSchedule(raidId, Date.now()),
    });
  } catch (err) {
    logger.warn({ err, raidId, trigger }, "Failed to publish achievement-evaluate QStash message");
  }
}
