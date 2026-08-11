import { fromZonedTime } from "date-fns-tz";
import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { raids, raidLogs, raidSignupSnapshotLinks } from "~/server/db/schema";
import type { RaidSignupLinkMatchReason } from "~/server/db/models/raid-signup-link-schema";
import {
  getLatestSignupSnapshotsByOccurrence,
  type LatestSignupSnapshot,
} from "~/server/services/raid-helper-snapshot-queries";
import { logger } from "~/lib/logger";

// Same zone used by getEasternDate/getEasternNow (~/lib/raid-formatting) for the
// raid.date <-> Eastern-wall-clock convention this app already follows.
const EASTERN_TIMEZONE = "America/New_York";

const MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;
const AUTO_LINK_CONFIDENCE_THRESHOLD = 0.85;
const AUTO_LINK_RUNNER_UP_GAP = 0.25;
const CANDIDATE_MIN_CONFIDENCE = 0.3;

export interface SignupLinkCandidate {
  raidHelperEventId: string;
  startTime: Date;
  confidence: number;
  matchReason: RaidSignupLinkMatchReason;
}

function timingScore(deltaMinutes: number): number {
  const abs = Math.abs(deltaMinutes);
  if (abs <= 30) return 1.0;
  if (abs <= 120) return 0.7;
  if (abs <= 360) return 0.4;
  if (abs <= 720) return 0.15;
  return 0;
}

function scoreZone(
  raidZone: string,
  snapshotZone: string | null,
  snapshotZoneSource: string | null,
): { score: number; quality: RaidSignupLinkMatchReason["zoneMatchQuality"] } {
  if (!snapshotZone) return { score: 0.5, quality: "unavailable" };
  if (snapshotZone !== raidZone) return { score: 0, quality: "mismatch" };
  return snapshotZoneSource === "softres"
    ? { score: 1.0, quality: "exact_softres" }
    : { score: 0.75, quality: "exact_title_parse" };
}

/**
 * Scores one candidate occurrence against a raid's zone/effective start time.
 * Pure/no I/O — exported separately so thresholds and weighting can be unit-tested
 * without a database. Weights, bands, and window size (TEMPLE-84) are concrete
 * starting points, not derived from real data — revisit once real raid/snapshot pairs
 * exist to tune against.
 */
export function scoreSignupLinkCandidate(
  raidZone: string,
  effectiveRaidStart: Date,
  snapshot: Pick<LatestSignupSnapshot, "raidHelperEventId" | "startTime" | "zone" | "zoneSource">,
): SignupLinkCandidate {
  const timingDeltaMinutes = Math.round(
    (snapshot.startTime.getTime() - effectiveRaidStart.getTime()) / 60_000,
  );
  const tScore = timingScore(timingDeltaMinutes);
  const { score: zScore, quality } = scoreZone(raidZone, snapshot.zone, snapshot.zoneSource);
  const confidence = 0.6 * tScore + 0.4 * zScore;

  return {
    raidHelperEventId: snapshot.raidHelperEventId,
    startTime: snapshot.startTime,
    confidence,
    matchReason: {
      timingDeltaMinutes,
      timingScore: tScore,
      zoneScore: zScore,
      zoneMatchQuality: quality,
    },
  };
}

/**
 * Earliest known start time for a raid: the min startTimeUTC across its raid_logs, or
 * (rare — a raid with no WCL import yet) noon Eastern on raid.date as a deliberately
 * low-precision fallback. The wide matching window absorbs that imprecision — worst
 * case it drops a real match into "needs review," it never produces a wrong auto-link.
 */
async function getEffectiveRaidStart(raidId: number, raidDate: string): Promise<Date> {
  const logs = await db
    .select({ startTimeUTC: raidLogs.startTimeUTC })
    .from(raidLogs)
    .where(eq(raidLogs.raidId, raidId));

  const timestamps = logs
    .map((log) => log.startTimeUTC)
    .filter((t): t is Date => t !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (timestamps[0]) return timestamps[0];

  return fromZonedTime(`${raidDate}T12:00:00`, EASTERN_TIMEZONE);
}

/**
 * Generates (and, if unambiguous, auto-confirms) raid<->signup-event linkage
 * candidates for one raid (TEMPLE-84). Best-effort by design — see
 * runPostRaidCreationSignupLinking, the caller both raid-insert paths use, which
 * swallows errors from this so a matching failure can never fail raid creation.
 */
export async function generateSignupLinkCandidatesForRaid(raidId: number): Promise<{
  outcome: "auto_linked" | "candidates_created" | "no_candidates" | "already_confirmed";
  count: number;
}> {
  const raidRows = await db
    .select({ raidId: raids.raidId, zone: raids.zone, date: raids.date })
    .from(raids)
    .where(eq(raids.raidId, raidId));
  const raid = raidRows[0];
  if (!raid) return { outcome: "no_candidates", count: 0 };

  const effectiveRaidStart = await getEffectiveRaidStart(raidId, raid.date);

  const occurrences = await getLatestSignupSnapshotsByOccurrence({
    startTimeFrom: new Date(effectiveRaidStart.getTime() - MATCH_WINDOW_MS),
    startTimeTo: new Date(effectiveRaidStart.getTime() + MATCH_WINDOW_MS),
  });

  const candidates = occurrences
    .map((occurrence) => scoreSignupLinkCandidate(raid.zone, effectiveRaidStart, occurrence))
    .sort((a, b) => b.confidence - a.confidence);

  const [top, runnerUp] = candidates;
  const isUnambiguousAutoLink =
    candidates.length > 0 &&
    top!.confidence >= AUTO_LINK_CONFIDENCE_THRESHOLD &&
    (!runnerUp || top!.confidence - runnerUp.confidence >= AUTO_LINK_RUNNER_UP_GAP);

  const toInsert = isUnambiguousAutoLink
    ? [top!]
    : candidates.filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE);

  // The confirmed-check, stale-candidate cleanup, and write all run inside one
  // transaction — including the toInsert.length === 0 case below, which still needs the
  // cleanup step even though it inserts nothing (a rerun that no longer finds ANY
  // qualifying candidate must still retire the raid's previous candidates, or they'd be
  // left sitting in the review queue forever). The confirmed-check narrows, but does not
  // eliminate, a concurrent-confirmation race — Greptile flagged this on TEMPLE-84's
  // review. A hard DB-level guarantee would need a partial unique index on (raid_id)
  // WHERE status = 'confirmed'; deliberately not adding one for a RAIDPLAN_MANAGE-gated
  // single-guild admin tool where two managers actioning the exact same raid within
  // milliseconds of each other is a negligible risk, and the worst case (a duplicate
  // confirmed row) is trivially fixable via reject, not data loss.
  return db.transaction(async (tx) => {
    const existingConfirmed = await tx
      .select({ id: raidSignupSnapshotLinks.id })
      .from(raidSignupSnapshotLinks)
      .where(
        and(
          eq(raidSignupSnapshotLinks.raidId, raidId),
          eq(raidSignupSnapshotLinks.status, "confirmed"),
        ),
      )
      .limit(1);
    if (existingConfirmed.length > 0) return { outcome: "already_confirmed" as const, count: 0 };

    // Retire this raid's still-outstanding candidates from any earlier run before
    // inserting fresh ones (if any) — otherwise a rerun (e.g. after a title/zone got
    // fixed upstream, or one that no longer finds any qualifying candidate at all)
    // leaves stale, no-longer-relevant candidates sitting in the review queue.
    await tx
      .update(raidSignupSnapshotLinks)
      .set({ status: "rejected" })
      .where(
        and(
          eq(raidSignupSnapshotLinks.raidId, raidId),
          eq(raidSignupSnapshotLinks.status, "candidate"),
        ),
      );

    if (toInsert.length === 0) return { outcome: "no_candidates" as const, count: 0 };

    // One upsert per candidate (never more than a handful) rather than a single batch
    // insert: onConflictDoUpdate's `set` needs each conflicting row updated to ITS OWN
    // candidate's values, and a row here can legitimately already exist — e.g. the reject
    // above just touched this exact occurrence, or a rerun's top candidate is unchanged
    // from a prior run — so onConflictDoNothing would wrongly leave a just-rejected row
    // rejected instead of refreshing it to the new result.
    for (const candidate of toInsert) {
      const status = isUnambiguousAutoLink ? ("confirmed" as const) : ("candidate" as const);
      await tx
        .insert(raidSignupSnapshotLinks)
        .values({
          raidId,
          raidHelperEventId: candidate.raidHelperEventId,
          startTime: candidate.startTime,
          status,
          source: "auto",
          confidence: candidate.confidence,
          matchReason: candidate.matchReason,
        })
        .onConflictDoUpdate({
          target: [
            raidSignupSnapshotLinks.raidId,
            raidSignupSnapshotLinks.raidHelperEventId,
            raidSignupSnapshotLinks.startTime,
          ],
          set: {
            status,
            source: "auto",
            confidence: candidate.confidence,
            matchReason: candidate.matchReason,
          },
        });
    }

    return {
      outcome: isUnambiguousAutoLink ? ("auto_linked" as const) : ("candidates_created" as const),
      count: toInsert.length,
    };
  });
}

/**
 * Best-effort side effect to run after a raid is created (TEMPLE-84). Never throws —
 * called from both raid-insert paths (raid.insertRaid and the Templar-frozen
 * POST /api/v1/raids), and a matching failure must never fail raid creation or alter
 * either response shape.
 */
export async function runPostRaidCreationSignupLinking(raidId: number): Promise<void> {
  try {
    await generateSignupLinkCandidatesForRaid(raidId);
  } catch (err) {
    logger.error({ err, raidId }, "Signup link matching failed after raid creation");
  }
}
