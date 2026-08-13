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

export const worldBuffRouter = createTRPCRouter({
  getAll: publicProcedure.query(() => getMatrix()),

  listActiveAssignments: publicProcedure.query(() => listActiveAssignments()),

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

  updateQueueType: protectedProcedure
    .input(z.object({ statusId: z.string().uuid(), queueType: worldBuffQueueTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateQueueType({ ...input, actingUserId: ctx.session.user.id });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  updateNotes: protectedProcedure
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
