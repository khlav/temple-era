import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, scopedProcedure } from "~/server/api/trpc";
import { SCOPE } from "~/lib/scopes";
import { raids, raidSignupSnapshotLinks } from "~/server/db/schema";
import { getLatestSignupSnapshotsByOccurrence } from "~/server/services/raid-helper-snapshot-queries";
import { generateSignupLinkCandidatesForRaid } from "~/server/services/raid-signup-link-matching";

/**
 * Review/override surface for TEMPLE-84 raid<->signup-event linkage. Gated on
 * RAIDPLAN_MANAGE throughout — signup data is only for people involved in raid
 * planning, not the general RAIDLOG_MANAGE audience.
 */
export const raidSignupLinkRouter = createTRPCRouter({
  list: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(
      z
        .object({
          status: z.enum(["candidate", "confirmed", "rejected"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const links = await ctx.db
        .select({
          id: raidSignupSnapshotLinks.id,
          raidId: raidSignupSnapshotLinks.raidId,
          raidHelperEventId: raidSignupSnapshotLinks.raidHelperEventId,
          startTime: raidSignupSnapshotLinks.startTime,
          status: raidSignupSnapshotLinks.status,
          source: raidSignupSnapshotLinks.source,
          confidence: raidSignupSnapshotLinks.confidence,
          matchReason: raidSignupSnapshotLinks.matchReason,
          reviewedById: raidSignupSnapshotLinks.reviewedById,
          reviewedAt: raidSignupSnapshotLinks.reviewedAt,
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
        .where(input?.status ? eq(raidSignupSnapshotLinks.status, input.status) : undefined)
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

  confirm: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ linkId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(raidSignupSnapshotLinks)
          .set({
            status: "confirmed",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(raidSignupSnapshotLinks.id, input.linkId))
          .returning({ id: raidSignupSnapshotLinks.id, raidId: raidSignupSnapshotLinks.raidId });

        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

        // Confirming one link supersedes any other still-live row for the same raid —
        // otherwise a raid with multiple auto-generated candidates keeps showing the
        // others as "needs review" after one is confirmed, with no single definitive link.
        await tx
          .update(raidSignupSnapshotLinks)
          .set({
            status: "rejected",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          })
          .where(
            and(
              eq(raidSignupSnapshotLinks.raidId, updated.raidId),
              ne(raidSignupSnapshotLinks.id, updated.id),
              ne(raidSignupSnapshotLinks.status, "rejected"),
            ),
          );

        return updated;
      });
    }),

  reject: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ linkId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(raidSignupSnapshotLinks)
        .set({
          status: "rejected",
          reviewedById: ctx.session.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(raidSignupSnapshotLinks.id, input.linkId))
        .returning({ id: raidSignupSnapshotLinks.id });

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /**
   * Manually point a raid at a different occurrence than any auto-generated candidate.
   * Supersedes (rejects) the raid's existing link rows rather than leaving them
   * alongside the new one, so "list" doesn't show two live rows for the same raid.
   */
  reassign: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(
      z.object({
        raidId: z.number().int(),
        raidHelperEventId: z.string().min(1).max(64),
        startTime: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A manual reassignment always means exact-confidence agreement by definition —
      // there is no "score" to a human's explicit choice. Applied on both insert and
      // (below) the conflict-update path, so a manual reassignment onto an occurrence
      // that already had an auto-generated candidate/rejected row never leaves that
      // row's stale auto confidence/matchReason displayed as if it described the
      // manual choice.
      const manualMatchReason = {
        timingDeltaMinutes: 0,
        timingScore: 1,
        zoneScore: 1,
        zoneMatchQuality: "exact_softres" as const,
      };

      return ctx.db.transaction(async (tx) => {
        await tx
          .update(raidSignupSnapshotLinks)
          .set({
            status: "rejected",
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(raidSignupSnapshotLinks.raidId, input.raidId));

        const [inserted] = await tx
          .insert(raidSignupSnapshotLinks)
          .values({
            raidId: input.raidId,
            raidHelperEventId: input.raidHelperEventId,
            startTime: input.startTime,
            status: "confirmed",
            source: "manual",
            confidence: 1,
            matchReason: manualMatchReason,
            reviewedById: ctx.session.user.id,
            reviewedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              raidSignupSnapshotLinks.raidId,
              raidSignupSnapshotLinks.raidHelperEventId,
              raidSignupSnapshotLinks.startTime,
            ],
            set: {
              status: "confirmed",
              source: "manual",
              confidence: 1,
              matchReason: manualMatchReason,
              reviewedById: ctx.session.user.id,
              reviewedAt: new Date(),
            },
          })
          .returning({ id: raidSignupSnapshotLinks.id });

        return inserted;
      });
    }),

  /** Re-run auto-matching for one raid, e.g. after a Raid Helper title/zone got fixed. */
  rerun: scopedProcedure(SCOPE.RAIDPLAN_MANAGE)
    .input(z.object({ raidId: z.number().int() }))
    .mutation(async ({ input }) => {
      return generateSignupLinkCandidatesForRaid(input.raidId);
    }),
});
