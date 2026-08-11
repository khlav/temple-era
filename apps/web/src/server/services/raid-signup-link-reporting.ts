import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { raidSignupSnapshotLinks } from "~/server/db/schema";
import type { RaidSignupLinkMatchReason } from "~/server/db/models/raid-signup-link-schema";
import {
  getLatestSignupSnapshotForOccurrence,
  getLatestSignupSnapshotsByOccurrence,
  type LatestSignupSnapshot,
} from "~/server/services/raid-helper-snapshot-queries";

function occurrenceKey(raidHelperEventId: string, startTime: Date): string {
  return `${raidHelperEventId}:${startTime.getTime()}`;
}

export interface SignupSnapshotForRaid {
  linkId: string;
  status: "candidate" | "confirmed" | "rejected";
  source: "auto" | "manual";
  confidence: number;
  matchReason: RaidSignupLinkMatchReason;
  raidHelperEventId: string;
  startTime: Date;
  snapshot: LatestSignupSnapshot | undefined;
}

/**
 * Single-raid signup detail (TEMPLE-84 reporting). Only the raid's confirmed link, if
 * any — a "candidate" isn't a real answer yet, and a raid keeps at most one confirmed
 * link at a time (see raid-signup-link.ts's confirm/reassign mutations). Not safe to
 * sum across raids: two raids can point at the same occurrence (doubleheaders), so
 * summing per-raid results here double-counts that occurrence's signups. Use
 * getSignupOccurrenceMetrics for anything additive across multiple raids.
 */
export async function getSignupSnapshotForRaid(
  raidId: number,
): Promise<SignupSnapshotForRaid | undefined> {
  const [link] = await db
    .select({
      linkId: raidSignupSnapshotLinks.id,
      status: raidSignupSnapshotLinks.status,
      source: raidSignupSnapshotLinks.source,
      confidence: raidSignupSnapshotLinks.confidence,
      matchReason: raidSignupSnapshotLinks.matchReason,
      raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
      startTime: raidSignupSnapshotLinks.startTime,
    })
    .from(raidSignupSnapshotLinks)
    .where(
      and(
        eq(raidSignupSnapshotLinks.raidId, raidId),
        eq(raidSignupSnapshotLinks.status, "confirmed"),
      ),
    )
    .limit(1);

  if (!link) return undefined;

  const snapshot = await getLatestSignupSnapshotForOccurrence(
    link.raidHelperEventId,
    link.startTime,
  );

  return { ...link, snapshot };
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
 * Occurrence-first signup aggregation (TEMPLE-84) — the anti-duplication mechanism for
 * reporting across multiple raids. Groups confirmed links by (raidHelperEventId,
 * startTime) BEFORE resolving each occurrence's one latest snapshot, so a doubleheader
 * sharing one Raid Helper event is counted once no matter how many raids point at it,
 * not once per raid. `raidIdToOccurrenceKey` lets a caller attribute an occurrence's
 * metric back to each of its raids without re-deriving the grouping.
 */
export async function getSignupOccurrenceMetrics(
  filter: { raidIds?: number[] } = {},
): Promise<SignupOccurrenceMetrics> {
  const conditions = [
    eq(raidSignupSnapshotLinks.status, "confirmed"),
    filter.raidIds?.length ? inArray(raidSignupSnapshotLinks.raidId, filter.raidIds) : undefined,
  ].filter((c) => c !== undefined);

  const links = await db
    .select({
      raidId: raidSignupSnapshotLinks.raidId,
      raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
      startTime: raidSignupSnapshotLinks.startTime,
    })
    .from(raidSignupSnapshotLinks)
    .where(and(...conditions));

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
