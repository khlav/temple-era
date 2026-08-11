import { fromZonedTime } from "date-fns-tz";
import { eq } from "drizzle-orm";
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

// Timing dominates the score; zone is a bonus only (see scoreZone) — a raid's actual
// WCL start time closely tracking the Raid Helper event's scheduled start is a strong,
// reliable signal, whereas zone naming is not: a shared doubleheader occurrence (one
// Raid Helper event covering e.g. MC + BWL) only ever captures ONE zone name, and
// SoftRes/title-parsed text won't always line up with raid.zone's exact string even
// for a genuine single-zone match. Zone can help confirm a good timing match; it must
// never be able to sink one.
const TIMING_WEIGHT = 0.8;
const ZONE_WEIGHT = 0.2;

// Below this, the signal is too weak to assert a link at all (TEMPLE-86 — there's no
// human review step to catch a bad guess, so the bar for auto-linking is "confident
// enough to stand alone").
const MIN_CONFIDENCE_TO_LINK = 0.5;

// If the top two candidates are this close, there's no principled way to prefer one —
// leave the raid unlinked rather than guess.
const AMBIGUOUS_GAP = 0.1;

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

/**
 * Zone is a bonus-only signal (TEMPLE-86) — an exact match adds confidence, but
 * anything else (no zone captured, OR a captured zone that doesn't match raid.zone)
 * scores the same neutral 0.5. Zone names are not reliable enough to treat a mismatch
 * as evidence of a bad match: a doubleheader's shared Raid Helper event only ever
 * captures one of its two zones, and even a genuine single-zone night's
 * SoftRes/title-parsed text won't always come back as the exact same string as
 * raid.zone. Only "these clearly line up" is trustworthy; "these don't line up" is not
 * — it's just as likely to mean "wrong zone captured for this raid" as "wrong raid".
 */
function scoreZone(
  raidZone: string,
  snapshotZone: string | null,
  snapshotZoneSource: string | null,
): { score: number; quality: RaidSignupLinkMatchReason["zoneMatchQuality"] } {
  if (!snapshotZone) return { score: 0.5, quality: "unavailable" };
  if (snapshotZone !== raidZone) return { score: 0.5, quality: "mismatch" };
  return snapshotZoneSource === "softres"
    ? { score: 1.0, quality: "exact_softres" }
    : { score: 0.85, quality: "exact_title_parse" };
}

/**
 * Scores one candidate occurrence against a raid's zone/effective start time.
 * Pure/no I/O — exported separately so thresholds and weighting can be unit-tested
 * without a database. Weights, bands, and window size (TEMPLE-84/86) are concrete
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
  const confidence = TIMING_WEIGHT * tScore + ZONE_WEIGHT * zScore;

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
 * low-precision fallback. The wide matching window absorbs that imprecision.
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

export type SignupLinkOutcome = "linked" | "no_match" | "ambiguous";

/**
 * Auto-links a raid to its best-matching Raid Helper signup occurrence (TEMPLE-84/86).
 * There is no review/candidate state — this either writes the link directly or writes
 * nothing:
 *
 * - No occurrence in the matching window at all -> "no_match".
 * - Top candidate below MIN_CONFIDENCE_TO_LINK -> "no_match". Too weak to assert alone
 *   with no human checking it.
 * - Top two candidates within AMBIGUOUS_GAP of each other (and both otherwise
 *   link-worthy) -> "ambiguous". No principled way to prefer one; leave it unlinked
 *   rather than guess.
 * - Otherwise -> "linked". Upserts on raidId (unique — at most one link per raid), so
 *   this is safe to call again (e.g. via the `rerun` mutation after a Raid Helper
 *   title/zone gets fixed) and will happily overwrite a prior manual link, same as any
 *   other explicit human-triggered rerun.
 */
export async function generateSignupLinkCandidatesForRaid(
  raidId: number,
): Promise<{ outcome: SignupLinkOutcome; confidence?: number }> {
  const raidRows = await db
    .select({ raidId: raids.raidId, zone: raids.zone, date: raids.date })
    .from(raids)
    .where(eq(raids.raidId, raidId));
  const raid = raidRows[0];
  if (!raid) return { outcome: "no_match" };

  const effectiveRaidStart = await getEffectiveRaidStart(raidId, raid.date);

  const occurrences = await getLatestSignupSnapshotsByOccurrence({
    startTimeFrom: new Date(effectiveRaidStart.getTime() - MATCH_WINDOW_MS),
    startTimeTo: new Date(effectiveRaidStart.getTime() + MATCH_WINDOW_MS),
  });

  const candidates = occurrences
    .map((occurrence) => scoreSignupLinkCandidate(raid.zone, effectiveRaidStart, occurrence))
    .sort((a, b) => b.confidence - a.confidence);

  const top = candidates[0];
  if (!top) return { outcome: "no_match" };
  if (top.confidence < MIN_CONFIDENCE_TO_LINK) return { outcome: "no_match" };

  const runnerUp = candidates[1];
  if (
    runnerUp &&
    runnerUp.confidence >= MIN_CONFIDENCE_TO_LINK &&
    top.confidence - runnerUp.confidence < AMBIGUOUS_GAP
  ) {
    return { outcome: "ambiguous" };
  }

  await db
    .insert(raidSignupSnapshotLinks)
    .values({
      raidId,
      raidHelperEventId: top.raidHelperEventId,
      startTime: top.startTime,
      source: "auto",
      confidence: top.confidence,
      matchReason: top.matchReason,
    })
    .onConflictDoUpdate({
      target: raidSignupSnapshotLinks.raidId,
      set: {
        raidHelperEventId: top.raidHelperEventId,
        startTime: top.startTime,
        source: "auto",
        confidence: top.confidence,
        matchReason: top.matchReason,
      },
    });

  return { outcome: "linked", confidence: top.confidence };
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
