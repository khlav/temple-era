"use client";

import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";

type ActiveAssignment = RouterOutputs["worldBuff"]["listActiveAssignments"][number];
type PastAssignment = RouterOutputs["worldBuff"]["listPastAssignments"][number];

/**
 * Flips a status row's ready_to_drop/dropped state — shared by the queue lists (mark
 * dropped/revert) and the scheduled turn-ins list (same actions, plus it has to move the
 * matching assignment row between the active/past caches so the UI updates instantly instead of
 * waiting on the round trip.
 */
export function useSetWorldBuffState() {
  const utils = api.useUtils();
  const { toast } = useToast();

  return api.worldBuff.setState.useMutation({
    onMutate: async (input) => {
      await Promise.all([
        utils.worldBuff.getAll.cancel(),
        utils.worldBuff.listActiveAssignments.cancel(),
        utils.worldBuff.listPastAssignments.cancel(),
      ]);

      const prevGetAll = utils.worldBuff.getAll.getData();
      const prevActive = utils.worldBuff.listActiveAssignments.getData();
      const prevPast = utils.worldBuff.listPastAssignments.getData();
      const droppedAt = input.state === "dropped" ? new Date() : null;
      const bySchedule = (a: { scheduledAt: Date | string }, b: { scheduledAt: Date | string }) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();

      utils.worldBuff.getAll.setData(undefined, (old) =>
        old?.map((row) =>
          row.id === input.statusId ? { ...row, state: input.state, droppedAt } : row,
        ),
      );

      if (input.state === "dropped") {
        const moving: PastAssignment[] = (prevActive ?? [])
          .filter((a) => a.status.id === input.statusId)
          .map((a) => ({ ...a, status: { ...a.status, state: input.state, droppedAt } }));
        utils.worldBuff.listActiveAssignments.setData(undefined, (old) =>
          old?.filter((a) => a.status.id !== input.statusId),
        );
        utils.worldBuff.listPastAssignments.setData(undefined, (old) =>
          old ? [...old, ...moving].sort(bySchedule) : old,
        );
      } else {
        const moving: ActiveAssignment[] = (prevPast ?? [])
          .filter((a) => a.status.id === input.statusId)
          .map((a) => ({ ...a, status: { ...a.status, state: input.state, droppedAt } }));
        utils.worldBuff.listPastAssignments.setData(undefined, (old) =>
          old?.filter((a) => a.status.id !== input.statusId),
        );
        utils.worldBuff.listActiveAssignments.setData(undefined, (old) =>
          old ? [...old, ...moving].sort(bySchedule) : old,
        );
      }

      return { prevGetAll, prevActive, prevPast };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevGetAll) utils.worldBuff.getAll.setData(undefined, ctx.prevGetAll);
      if (ctx?.prevActive) utils.worldBuff.listActiveAssignments.setData(undefined, ctx.prevActive);
      if (ctx?.prevPast) utils.worldBuff.listPastAssignments.setData(undefined, ctx.prevPast);
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      void utils.worldBuff.getAll.invalidate();
      void utils.worldBuff.listActiveAssignments.invalidate();
      void utils.worldBuff.listPastAssignments.invalidate();
    },
  });
}
