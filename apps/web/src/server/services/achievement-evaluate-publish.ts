import { logger } from "~/lib/logger";
import { env } from "~/env";
import { qstashClient } from "~/server/services/qstash-client";

export type AchievementEvaluateTrigger =
  | "raid_log_import"
  | "signup_link_resolved"
  | "bench_updated";

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
    await qstashClient.publishJSON({
      url: new URL("/api/qstash/achievement-evaluate", env.NEXT_PUBLIC_APP_URL).toString(),
      body: { raidId, trigger },
    });
  } catch (err) {
    logger.warn({ err, raidId, trigger }, "Failed to publish achievement-evaluate QStash message");
  }
}
