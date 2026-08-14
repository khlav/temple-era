import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  scopedProcedure,
} from "~/server/api/trpc";
import { SCOPE } from "~/lib/scopes";
import { WORLD_BUFF_ITEMS } from "~/lib/world-buffs";
import {
  WorldBuffServiceError,
  createAssignment,
  deleteAssignment,
  deleteStatus,
  getMatrix,
  listActiveAssignments,
  listPastAssignments,
  setInactive,
  setState,
  submitAvailability,
  updateAssignment,
  updateNotes,
  updateQueueType,
} from "~/server/services/world-buff-service";

const worldBuffItemSchema = z.enum(WORLD_BUFF_ITEMS);
const worldBuffQueueTypeSchema = z.enum(["main", "alt", "backup"]);
const worldBuffStateSchema = z.enum(["ready_to_drop", "dropped"]);

function toTRPCError(error: unknown): never {
  if (error instanceof WorldBuffServiceError) {
    throw new TRPCError({
      code: error.code === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT",
      message: error.message,
    });
  }
  throw error;
}

// `getAll`/`listActiveAssignments` are public, but a resolved Discord identity is only meant for
// worldbuff:manage viewers (the DM icon in the UI) — redact it for everyone else rather than
// gating the whole query behind the scope.
function redactDiscord<T extends { discordUserId: string | null; discordUsername: string | null }>(
  row: T,
): T {
  return { ...row, discordUserId: null, discordUsername: null };
}

export const worldBuffRouter = createTRPCRouter({
  // `assignments` on a dropped row is exactly what `listPastAssignments` (manager-only) exists
  // to gate — an active row's assignments are already public via `listActiveAssignments`, so
  // only those are safe to leave attached here. Stripping them for dropped rows closes that
  // leak without touching the shape callers that only care about active rows depend on.
  getAll: publicProcedure.query(async ({ ctx }) => {
    const session = await ctx.getSession();
    const canManage = !!session?.user?.scopes?.includes(SCOPE.WORLDBUFF_MANAGE);
    const rows = await getMatrix();
    return rows.map((row) => {
      const trimmed = row.state === "ready_to_drop" ? row : { ...row, assignments: [] };
      return canManage ? trimmed : redactDiscord(trimmed);
    });
  }),

  listActiveAssignments: publicProcedure.query(async ({ ctx }) => {
    const session = await ctx.getSession();
    const canManage = !!session?.user?.scopes?.includes(SCOPE.WORLDBUFF_MANAGE);
    const rows = await listActiveAssignments();
    return canManage ? rows : rows.map((row) => ({ ...row, status: redactDiscord(row.status) }));
  }),

  listPastAssignments: scopedProcedure(SCOPE.WORLDBUFF_MANAGE).query(() => listPastAssignments()),

  submitAvailability: protectedProcedure
    .input(
      z.object({
        characterName: z.string().trim().min(1).max(128),
        characterId: z.number().int().positive().optional(),
        item: worldBuffItemSchema,
        queueType: worldBuffQueueTypeSchema.optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await submitAvailability({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Unlike submitAvailability (open self-service upsert of your own submission), re-tagging
  // someone's queue placement after the fact is a raid-lead call — the UI only ever exposes
  // this via the manager-only QueueTypeMenu, so the server should enforce that too rather than
  // leaving it reachable by any authenticated session.
  updateQueueType: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(z.object({ statusId: z.string().uuid(), queueType: worldBuffQueueTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateQueueType({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  updateNotes: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(z.object({ statusId: z.string().uuid(), notes: z.string().max(2000).nullable() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateNotes({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  setState: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(z.object({ statusId: z.string().uuid(), state: worldBuffStateSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await setState({ ...input, actingUserId: ctx.session.user.id, source: "web" });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Manual "gone quiet" flag — deliberately independent of `state`/`setState`, so it can't
  // un-drop a lifetime completion and doesn't share that mutation's audit `source` concept.
  setInactive: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(z.object({ statusId: z.string().uuid(), inactive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await setInactive({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  createAssignment: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(
      z.object({
        statusId: z.string().uuid(),
        scheduledAt: z.coerce.date(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createAssignment({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  updateAssignment: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(
      z.object({
        assignmentId: z.string().uuid(),
        statusId: z.string().uuid().optional(),
        scheduledAt: z.coerce.date().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateAssignment({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  deleteAssignment: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(z.object({ assignmentId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        return await deleteAssignment(input);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  // Unlike submitAvailability/updateQueueType (open self-service), deleting a submission
  // outright is manager-only — it's destructive and cascades to any scheduled turn-in for it.
  deleteStatus: scopedProcedure(SCOPE.WORLDBUFF_MANAGE)
    .input(z.object({ statusId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        return await deleteStatus(input);
      } catch (error) {
        toTRPCError(error);
      }
    }),
});
