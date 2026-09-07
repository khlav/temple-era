import { unstable_cache, revalidateTag } from "next/cache";
import { count, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { raidLogAttendeeMap, raidLogs, raids, raidBenchMap } from "~/server/db/schema";

const ATTENDEE_TAG = "raid-attendance-by-zone";
const BENCH_TAG = "raid-bench-by-zone";

// 24h fallback, not the real freshness mechanism — invalidateAttendanceByZoneCache() below
// busts these tags synchronously on every write, so this is only a safety net for a missed
// call site. Set long (rather than matched to the ~2x/day write cadence) because the two are
// independent: a shorter TTL wouldn't tighten that safety net meaningfully, it would just
// force pointless regenerations on nights with no raid at all.
const REVALIDATE_SECONDS = 60 * 60 * 24;

export interface AttendanceByZoneRow {
  characterId: number | null;
  zone: string | null;
  uniqueRaidCount: number;
}

/**
 * Guild-wide attended-raid counts per character per zone. A global, parameterless aggregate —
 * this pattern showed up in pg_stat_statements at 602s cumulative time over 18,609 calls (100%
 * cache hit rate, so CPU-bound on the join+group, not I/O) because it was being recomputed on
 * essentially every characters-page load even though the underlying data only changes when a
 * raid log is written. `unstable_cache` here is backed by Vercel's Data Cache, which is shared
 * across serverless instances — this must hold across users, not just within one session.
 */
export const getRaidAttendanceByZone = unstable_cache(
  async (): Promise<AttendanceByZoneRow[]> => {
    return db
      .select({
        characterId: raidLogAttendeeMap.characterId,
        zone: raids.zone,
        uniqueRaidCount: count(raids.raidId).as("uniqueRaidCount"),
      })
      .from(raidLogAttendeeMap)
      .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
      .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
      .where(eq(raidLogAttendeeMap.isIgnored, false))
      .groupBy(raidLogAttendeeMap.characterId, raids.zone);
  },
  ["raid-attendance-by-zone"],
  { tags: [ATTENDEE_TAG], revalidate: REVALIDATE_SECONDS },
);

/** Bench equivalent of getRaidAttendanceByZone — same reasoning, separate tag (see below). */
export const getRaidBenchByZone = unstable_cache(
  async (): Promise<AttendanceByZoneRow[]> => {
    return db
      .select({
        characterId: raidBenchMap.characterId,
        zone: raids.zone,
        uniqueRaidCount: count(raids.raidId).as("uniqueRaidCount"),
      })
      .from(raidBenchMap)
      .innerJoin(raids, eq(raidBenchMap.raidId, raids.raidId))
      .groupBy(raidBenchMap.characterId, raids.zone);
  },
  ["raid-bench-by-zone"],
  { tags: [BENCH_TAG], revalidate: REVALIDATE_SECONDS },
);

/**
 * The ONLY place that should call revalidateTag for these two caches — every write site that
 * touches raid_log_attendee_map, raid_bench_map, raids, or raid_logs.raid_id imports this
 * instead of calling revalidateTag directly, so there's exactly one place to audit what busts
 * the cache. Two tags (not one) so a bench-only write doesn't force-bust the attendee half and
 * vice versa.
 *
 * "max" is passed as revalidateTag's second (profile) argument to get full/immediate
 * invalidation — Next 16 made that argument required and treats an omitted one as deprecated,
 * recommending exactly "max" for this case (see the deprecation message at
 * https://nextjs.org/docs/messages/revalidate-tag-single-arg). `updateTag` is Next's other
 * option but only works inside a Server Action; several of this cache's write sites are plain
 * Route Handlers, which `updateTag` explicitly rejects.
 */
export function invalidateAttendanceByZoneCache(opts: {
  attendee?: boolean;
  bench?: boolean;
}): void {
  if (opts.attendee) revalidateTag(ATTENDEE_TAG, "max");
  if (opts.bench) revalidateTag(BENCH_TAG, "max");
}
