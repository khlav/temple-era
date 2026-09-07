import { eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { raidSignupSnapshotLinks, raidLogs } from "~/server/db/schema";
import type { RaidSignupLinkMatchReason } from "~/server/db/models/raid-signup-link-schema";
import { env } from "~/env";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import {
  getLatestSignupSnapshotForOccurrence,
  getLatestSignupSnapshotsByOccurrence,
  type LatestSignupSnapshot,
} from "~/server/services/raid-helper-snapshot-queries";

function occurrenceKey(raidHelperEventId: string, startTime: Date): string {
  return `${raidHelperEventId}:${startTime.getTime()}`;
}

/** The one place a Raid Helper event/channel pair becomes a clickable Discord link. */
export function discordEventUrl(
  channelId: string | null,
  raidHelperEventId: string,
): string | null {
  return channelId
    ? `https://discord.com/channels/${env.DISCORD_SERVER_ID}/${channelId}/${raidHelperEventId}`
    : null;
}

export interface SignupSnapshotForRaid {
  linkId: string;
  source: "auto" | "manual";
  confidence: number;
  matchReason: RaidSignupLinkMatchReason;
  raidHelperEventId: string;
  startTime: Date;
  snapshot: LatestSignupSnapshot | undefined;
  eventUrl: string | null;
}

/**
 * Single-raid signup detail (TEMPLE-84/86 reporting). There is at most one row per raid
 * (raidId is unique — see raid-signup-link-schema.ts), so this is a plain lookup, not a
 * status filter. Not safe to sum across raids: two raids can point at the same
 * occurrence (doubleheaders), so summing per-raid results here double-counts that
 * occurrence's signups. Use getSignupOccurrenceMetrics for anything additive across
 * multiple raids.
 */
export async function getSignupSnapshotForRaid(
  raidId: number,
): Promise<SignupSnapshotForRaid | undefined> {
  const [link] = await db
    .select({
      linkId: raidSignupSnapshotLinks.id,
      source: raidSignupSnapshotLinks.source,
      confidence: raidSignupSnapshotLinks.confidence,
      matchReason: raidSignupSnapshotLinks.matchReason,
      raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
      startTime: raidSignupSnapshotLinks.startTime,
    })
    .from(raidSignupSnapshotLinks)
    .where(eq(raidSignupSnapshotLinks.raidId, raidId))
    .limit(1);

  if (!link) return undefined;

  const snapshot = await getLatestSignupSnapshotForOccurrence(
    link.raidHelperEventId,
    link.startTime,
  );

  return {
    ...link,
    snapshot,
    eventUrl: discordEventUrl(snapshot?.channelId ?? null, link.raidHelperEventId),
  };
}

export interface SignupVsRaidLogSummary {
  raidLog: {
    raidLogId: string;
    name: string;
    startTimeUTC: Date;
    endTimeUTC: Date | null;
    wclUrl: string;
  } | null;
  signup:
    | {
        title: string | null;
        startTime: Date;
        source: "auto" | "manual";
        eventUrl: string | null;
      }
    | undefined;
}

/**
 * Side-by-side timing for a raid's WCL log vs. its linked Raid Helper signup — backs the
 * comparison card on the Signup Timeline / Signups <-> Attendees tabs. Exists because the
 * auto-matcher can confidently link the wrong occurrence (it weighs timing far more than
 * roster overlap — see raid-signup-link-matching.ts), and the two timestamps disagreeing
 * is the one signal a human can catch at a glance that the algorithm can't.
 *
 * A raid can carry multiple raid_log rows (e.g. a wipe-then-clear pair); the earliest by
 * startTimeUTC is shown as "the" raid log — the same one getEffectiveRaidStart treats as
 * canonical for auto-matching, so this card stays consistent with what the algorithm
 * actually compared against.
 */
export async function getSignupVsRaidLogSummary(raidId: number): Promise<SignupVsRaidLogSummary> {
  const logs = await db
    .select({
      raidLogId: raidLogs.raidLogId,
      name: raidLogs.name,
      startTimeUTC: raidLogs.startTimeUTC,
      endTimeUTC: raidLogs.endTimeUTC,
    })
    .from(raidLogs)
    .where(eq(raidLogs.raidId, raidId));

  const timedLogs = logs
    .map((l) => (l.startTimeUTC ? { ...l, startTimeUTC: l.startTimeUTC } : null))
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.startTimeUTC.getTime() - b.startTimeUTC.getTime());
  const earliest = timedLogs[0];

  const link = await getSignupSnapshotForRaid(raidId);

  return {
    raidLog: earliest
      ? {
          raidLogId: earliest.raidLogId,
          name: earliest.name,
          startTimeUTC: earliest.startTimeUTC,
          endTimeUTC: earliest.endTimeUTC,
          wclUrl: GenerateWCLReportUrl(earliest.raidLogId),
        }
      : null,
    signup: link
      ? {
          title: link.snapshot?.title ?? null,
          startTime: link.startTime,
          source: link.source,
          eventUrl: link.eventUrl,
        }
      : undefined,
  };
}

export interface SignupOccurrenceMetric {
  raidHelperEventId: string;
  startTime: Date;
  signUpCount: number;
  raidIds: number[];
}

export interface SignupOccurrenceMetrics {
  occurrences: SignupOccurrenceMetric[];
  raidIdToOccurrenceKey: Map<number, string>;
}

/**
 * Occurrence-first signup aggregation (TEMPLE-84/86) — the anti-duplication mechanism
 * for reporting across multiple raids. Groups links by (raidHelperEventId, startTime)
 * BEFORE resolving each occurrence's one latest snapshot, so a doubleheader sharing one
 * Raid Helper event is counted once no matter how many raids point at it, not once per
 * raid. `raidIdToOccurrenceKey` lets a caller attribute an occurrence's metric back to
 * each of its raids without re-deriving the grouping.
 */
export async function getSignupOccurrenceMetrics(
  filter: { raidIds?: number[] } = {},
): Promise<SignupOccurrenceMetrics> {
  const links = await db
    .select({
      raidId: raidSignupSnapshotLinks.raidId,
      raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
      startTime: raidSignupSnapshotLinks.startTime,
    })
    .from(raidSignupSnapshotLinks)
    .where(
      filter.raidIds?.length ? inArray(raidSignupSnapshotLinks.raidId, filter.raidIds) : undefined,
    );

  if (links.length === 0) return { occurrences: [], raidIdToOccurrenceKey: new Map() };

  const occurrencesByKey = new Map<
    string,
    { raidHelperEventId: string; startTime: Date; raidIds: number[] }
  >();
  const raidIdToOccurrenceKey = new Map<number, string>();

  for (const link of links) {
    const key = occurrenceKey(link.raidHelperEventId, link.startTime);
    raidIdToOccurrenceKey.set(link.raidId, key);
    const existing = occurrencesByKey.get(key);
    if (existing) {
      existing.raidIds.push(link.raidId);
    } else {
      occurrencesByKey.set(key, {
        raidHelperEventId: link.raidHelperEventId,
        startTime: link.startTime,
        raidIds: [link.raidId],
      });
    }
  }

  const eventIds = [...new Set(links.map((link) => link.raidHelperEventId))];
  const snapshots = await getLatestSignupSnapshotsByOccurrence({ raidHelperEventIds: eventIds });
  const snapshotByKey = new Map(
    snapshots.map((snapshot) => [
      occurrenceKey(snapshot.raidHelperEventId, snapshot.startTime),
      snapshot,
    ]),
  );

  const occurrences = [...occurrencesByKey.entries()].map(([key, occurrence]) => ({
    raidHelperEventId: occurrence.raidHelperEventId,
    startTime: occurrence.startTime,
    signUpCount: snapshotByKey.get(key)?.signUpCount ?? 0,
    raidIds: occurrence.raidIds,
  }));

  return { occurrences, raidIdToOccurrenceKey };
}
