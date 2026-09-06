import { and, desc, eq, inArray } from "drizzle-orm";
import { type db as database } from "~/server/db";
import {
  raidSignupSnapshotLinks,
  raidHelperSignupSnapshots,
  raidLogs,
  raidLogAttendeeMap,
  raidBenchMap,
  characters,
} from "~/server/db/schema";
import { matchSignupsToCharacters, type SignupInput } from "~/server/api/helpers/match-signups";
import { classifySignupBucket } from "~/lib/signup-timeline";
import { env } from "~/env";
import {
  buildSignupAttendanceComparison,
  type ComparisonTotals,
} from "~/server/services/signup-attendance-comparison-buckets";

export type {
  ComparisonMember,
  ComparisonCell,
  ComparisonTotals,
  FamilyKeyed,
} from "~/server/services/signup-attendance-comparison-buckets";
export { buildSignupAttendanceComparison } from "~/server/services/signup-attendance-comparison-buckets";

type DB = Pick<typeof database, "select" | "selectDistinct">;

export type SignupAttendanceComparison = ComparisonTotals & {
  available: true;
  capturedAt: Date;
  raidHelperEventId: string;
  eventUrl: string | null;
};

export type SignupAttendanceComparisonResult =
  | SignupAttendanceComparison
  | { available: false; reason: "no-link" | "no-checkpoint" };

/**
 * TEMPLE-98 Signups <-> Attendees tab data-fetching wrapper. Resolves the raid's linked
 * 0h checkpoint and attendance record, then hands them to buildSignupAttendanceComparison
 * (signup-attendance-comparison-buckets.ts) for the actual bucketing.
 */
export async function getSignupAttendanceComparisonForRaid(
  db: DB,
  raidId: number,
): Promise<SignupAttendanceComparisonResult> {
  const [link] = await db
    .select({
      raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
      startTime: raidSignupSnapshotLinks.startTime,
    })
    .from(raidSignupSnapshotLinks)
    .where(eq(raidSignupSnapshotLinks.raidId, raidId))
    .limit(1);

  if (!link) return { available: false, reason: "no-link" };

  const [snapshot] = await db
    .select({
      capturedAt: raidHelperSignupSnapshots.capturedAt,
      signups: raidHelperSignupSnapshots.signups,
      channelId: raidHelperSignupSnapshots.channelId,
    })
    .from(raidHelperSignupSnapshots)
    .where(
      and(
        eq(raidHelperSignupSnapshots.raidHelperEventId, link.raidHelperEventId),
        eq(raidHelperSignupSnapshots.startTime, link.startTime),
        eq(raidHelperSignupSnapshots.checkpoint, "0h"),
      ),
    )
    .orderBy(desc(raidHelperSignupSnapshots.capturedAt))
    .limit(1);

  if (!snapshot) return { available: false, reason: "no-checkpoint" };

  // "Signed up" = confirmed + bench only, matching summarizeSignupCounts' definition used
  // everywhere else in the app. Tentative/Late never committed, and Absence explicitly
  // said they weren't coming — neither belongs in a signed-up-vs-attended reconciliation.
  const eligibleSignups = snapshot.signups.filter((s) => {
    const bucket = classifySignupBucket(s.className);
    return bucket === "confirmed" || bucket === "bench";
  });

  const matchInput: SignupInput[] = eligibleSignups.map((s) => ({
    userId: s.userId,
    discordName: s.name,
    className: s.className,
    specName: s.specName,
    partyId: null,
    slotId: null,
  }));

  const matches = await matchSignupsToCharacters(db, matchInput);

  const raidLogRows = await db
    .select({ raidLogId: raidLogs.raidLogId })
    .from(raidLogs)
    .where(eq(raidLogs.raidId, raidId));
  const raidLogIds = raidLogRows.map((r) => r.raidLogId);

  const attendeeRows = raidLogIds.length
    ? await db
        .selectDistinct({
          characterId: characters.characterId,
          name: characters.name,
          class: characters.class,
          primaryCharacterId: characters.primaryCharacterId,
        })
        .from(raidLogAttendeeMap)
        .innerJoin(characters, eq(raidLogAttendeeMap.characterId, characters.characterId))
        .where(inArray(raidLogAttendeeMap.raidLogId, raidLogIds))
    : [];

  const benchRows = await db
    .select({
      characterId: characters.characterId,
      name: characters.name,
      class: characters.class,
      primaryCharacterId: characters.primaryCharacterId,
    })
    .from(raidBenchMap)
    .innerJoin(characters, eq(raidBenchMap.characterId, characters.characterId))
    .where(eq(raidBenchMap.raidId, raidId));

  const totals = buildSignupAttendanceComparison(matches, attendeeRows, benchRows);

  return {
    available: true,
    capturedAt: snapshot.capturedAt,
    raidHelperEventId: link.raidHelperEventId,
    eventUrl: snapshot.channelId
      ? `https://discord.com/channels/${env.DISCORD_SERVER_ID}/${snapshot.channelId}/${link.raidHelperEventId}`
      : null,
    ...totals,
  };
}
