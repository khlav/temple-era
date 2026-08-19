import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, scopedProcedure } from "~/server/api/trpc";
import { SCOPE } from "~/lib/scopes";
import { raids, raidSignupSnapshotLinks } from "~/server/db/schema";
import {
  getLatestSignupSnapshotForOccurrence,
  getLatestSignupSnapshotsByOccurrence,
  getSignupSnapshotHistoryForOccurrence,
} from "~/server/services/raid-helper-snapshot-queries";
import { generateSignupLinkCandidatesForRaid } from "~/server/services/raid-signup-link-matching";
import { getSignupSnapshotForRaid } from "~/server/services/raid-signup-link-reporting";

/**
 * Signup-history surface for TEMPLE-84/86 raid<->signup-event linkage. Gated on
 * RAIDPLAN_MANAGE throughout — signup data is only for people involved in raid
 * planning, not the general RAIDLOG_MANAGE audience.
 *
 * There is no review/confirm/reject workflow (TEMPLE-86 dropped it) — matching either
 * auto-links a raid or leaves it unlinked (see raid-signup-link-matching.ts). `list` is
 * a plain read of whatever got auto-linked; `reassign` is the only write path, for the
 * rare case where the auto-match is wrong.
 */
export const raidSignupLinkRouter = createTRPCRouter({
  list: scopedProcedure(SCOPE.RAIDPLAN_MANAGE).query(async ({ ctx }) => {
    const links = await ctx.db
      .select({
        id: raidSignupSnapshotLinks.id,
        raidId: raidSignupSnapshotLinks.raidId,
        raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
        startTime: raidSignupSnapshotLinks.startTime,
        source: raidSignupSnapshotLinks.source,
        confidence: raidSignupSnapshotLinks.confidence,
        matchReason: raidSignupSnapshotLinks.matchReason,
        createdAt: raidSignupSnapshotLinks.createdAt,
        raid: {
          raidId: raids.raidId,
          name: raids.name,
          date: raids.date,
          zone: raids.zone,
        },
      })
      .from(raidSignupSnapshotLinks)
      .innerJoin(raids, eq(raidSignupSnapshotLinks.raidId, raids.raidId))
      .orderBy(desc(raidSignupSnapshotLinks.createdAt));

    const eventIds = [...new Set(links.map((link) => link.raidHelperEventId))];
    const snapshots = eventIds.length
      ? await getLatestSignupSnapshotsByOccurrence({ raidHelperEventIds: eventIds })
      : [];
    const snapshotByOccurrence = new Map(
      snapshots.map((snapshot) => [
        `${snapshot.raidHelperEventId}:${snapshot.startTime.getTime()}`,
        snapshot,
      ]),
    );

    return links.map((link) => ({
      ...link,
      snapshot: snapshotByOccurrence.get(`${link.raidHelperEventId}:${link.startTime.getTime()}`),
    }));
  }),

  /** Manually point a raid at a different occurrence than what auto-matching picked. */
  reassign: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(
      z.object({
        raidId: z.number().int(),
        raidHelperEventId: z.string().min(1).max(64),
        startTime: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Refuse a typo'd event id/timestamp before it becomes a link with nothing behind
      // it — an invalid target here would also permanently stick, since there's no
      // confirm step left to catch it.
      const targetSnapshot = await getLatestSignupSnapshotForOccurrence(
        input.raidHelperEventId,
        input.startTime,
      );
      if (!targetSnapshot) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No signup snapshot exists for that Raid Helper event ID and start time.",
        });
      }

      // A manual reassignment always means exact-confidence agreement by definition —
      // there is no "score" to a human's explicit choice.
      const manualMatchReason = {
        timingDeltaMinutes: 0,
        timingScore: 1,
        zoneScore: 1,
        zoneMatchQuality: "exact_softres" as const,
      };

      const [upserted] = await ctx.db
        .insert(raidSignupSnapshotLinks)
        .values({
          raidId: input.raidId,
          raidHelperEventId: input.raidHelperEventId,
          startTime: input.startTime,
          source: "manual",
          confidence: 1,
          matchReason: manualMatchReason,
          createdById: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: raidSignupSnapshotLinks.raidId,
          set: {
            raidHelperEventId: input.raidHelperEventId,
            startTime: input.startTime,
            source: "manual",
            confidence: 1,
            matchReason: manualMatchReason,
          },
        })
        .returning({ id: raidSignupSnapshotLinks.id });

      return upserted;
    }),

  /** Re-run auto-matching for one raid, e.g. after a Raid Helper title/zone got fixed. */
  rerun: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ raidId: z.number().int() }))
    .mutation(async ({ input }) => {
      return generateSignupLinkCandidatesForRaid(input.raidId);
    }),

  /** This raid's signup link (if any) plus its latest snapshot, for display. */
  forRaid: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ raidId: z.number().int() }))
    .query(async ({ input }) => {
      return getSignupSnapshotForRaid(input.raidId);
    }),

  /**
   * Full checkpoint history for the Signup Timeline tab (TEMPLE-97). Never throws for a
   * missing link or empty history — the UI renders its own empty states for both.
   */
  timelineForRaid: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ raidId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [link] = await ctx.db
        .select({
          raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
          startTime: raidSignupSnapshotLinks.startTime,
        })
        .from(raidSignupSnapshotLinks)
        .where(eq(raidSignupSnapshotLinks.raidId, input.raidId))
        .limit(1);

      if (!link) return { link: null, snapshots: [] };

      const snapshots = await getSignupSnapshotHistoryForOccurrence(
        link.raidHelperEventId,
        link.startTime,
      );

      return { link, snapshots };
    }),

  /**
   * Same checkpoint history as `timelineForRaid`, but keyed directly on the Raid Helper
   * occurrence rather than a `raids` row — for scheduled/upcoming events, which have no
   * raid yet (a raid is only created from a WCL log after the event happens). Backs the
   * standalone `/raid-manager/signups/[eventId]` page.
   */
  timelineForOccurrence: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ raidHelperEventId: z.string().min(1), startTime: z.coerce.date() }))
    .query(async ({ input }) => {
      const snapshots = await getSignupSnapshotHistoryForOccurrence(
        input.raidHelperEventId,
        input.startTime,
      );

      return { snapshots };
    }),
});
