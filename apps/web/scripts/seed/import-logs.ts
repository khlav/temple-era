import { desc, sql as raw } from "drizzle-orm";
import { getDefaultAttendanceWeight } from "~/lib/raid-weights";
import { SCOPES } from "~/lib/scopes";
import { createDiscordRouteCaller } from "~/server/api/discord-trpc-caller";
import { db } from "~/server/db";
import { raidLogs, raids } from "~/server/db/schema";
import type { HarvestedLog } from "./harvest";

/**
 * Imports each harvested report ID from Warcraft Logs into the local database, then creates the
 * `raid` row that ties it together.
 *
 * Deliberately goes through the tRPC caller rather than re-implementing the writes: that is the
 * same path apps/web/src/app/api/discord/create-raid/route.ts uses for the bot's
 * "paste a WCL link" flow, so the seeded rows are produced by exactly the code that produces real
 * ones (including character upserts, attendee replacement, and world-buff family reactivation).
 * The alternative — copying the three write blocks — is what the v1 refresh-logs route does, and
 * duplicating it a third time would be one more place to drift.
 */
export async function importLogs(opts: {
  logs: HarvestedLog[];
  userId: string;
}): Promise<{ imported: number; skipped: string[] }> {
  // Every scope: the inner procedures are scopedProcedure-gated, and this identity is also a
  // SUPERADMIN_DISCORD_IDS holder, so granting everything here matches what it resolves to at
  // runtime anyway.
  const caller = createDiscordRouteCaller({
    id: opts.userId,
    name: "Local Dev Seed",
    email: null,
    image: null,
    isRaidManager: true,
    isAdmin: true,
    isSuperadmin: true,
    characterId: null,
    scopes: [...SCOPES],
  });

  const skipped: string[] = [];
  let imported = 0;

  for (const log of opts.logs) {
    try {
      const result = await caller.raidLog.importAndGetRaidLogByRaidLogId(log.raidLogId);
      if (!result) {
        skipped.push(`${log.raidLogId} (WCL returned nothing)`);
        continue;
      }

      const zone = result.zone ?? log.zone ?? "";
      // The log's own start time is the raid night; harvest's value is only a fallback for a log
      // WCL no longer serves.
      const startedAt =
        result.startTimeUTC ?? (log.startTimeUTC ? new Date(log.startTimeUTC) : null);

      await caller.raid.insertRaid({
        name: result.name ?? log.name,
        date: (startedAt ?? new Date()).toISOString().slice(0, 10),
        zone,
        attendanceWeight: getDefaultAttendanceWeight(zone),
        raidLogIds: [log.raidLogId],
        bench: {},
      });
      imported++;
    } catch (error) {
      // A single bad report must not abort a 25-log seed. The known case is a report with zero
      // participants: mutateInsertRaidLogWithAttendees bulk-inserts the attendee list without an
      // empty-array guard (unlike the v1 refresh route) and throws on it.
      skipped.push(`${log.raidLogId} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return { imported, skipped };
}

/**
 * Slides every imported raid forward so the most recent one lands today.
 *
 * Without this the dev database looks broken rather than empty: the dashboard, the
 * `views.tracked_raids_*` / `views.primary_raid_attendance_l6lockoutwk` reporting views, and the
 * rare-recipes "active raider" badge are all windowed on recent lockout weeks, and real logs are
 * historical. Relative spacing between raids is preserved, so attendance streaks and
 * lockout-week grouping still look like a real schedule.
 */
export async function shiftRaidDatesToRecent(): Promise<{
  shiftedDays: number;
  raidCount: number;
}> {
  const [newest] = await db
    .select({ date: raids.date })
    .from(raids)
    .orderBy(desc(raids.date))
    .limit(1);

  if (!newest) return { shiftedDays: 0, raidCount: 0 };

  const newestMs = new Date(newest.date).getTime();
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const shiftedDays = Math.round((todayMs - newestMs) / 86_400_000);
  if (shiftedDays <= 0) return { shiftedDays: 0, raidCount: 0 };

  const updated = await db
    .update(raids)
    .set({ date: raw`(${raids.date} + ${`${shiftedDays} days`}::interval)::date` })
    .returning({ id: raids.raidId });

  // Keep the logs' timestamps consistent with their raid's new date — the signup-snapshot linker
  // and the achievement rules both compare log times against raid dates.
  await db.update(raidLogs).set({
    startTimeUTC: raw`${raidLogs.startTimeUTC} + ${`${shiftedDays} days`}::interval`,
    endTimeUTC: raw`${raidLogs.endTimeUTC} + ${`${shiftedDays} days`}::interval`,
  });

  return { shiftedDays, raidCount: updated.length };
}
