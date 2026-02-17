import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";

interface UseRaidPlanMutationsOptions {
  planId: string;
  onEncounterDeleted?: () => void;
}

export function useRaidPlanMutations({
  planId,
  onEncounterDeleted,
}: UseRaidPlanMutationsOptions) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const {
    data: plan,
    isLoading,
    error,
    refetch,
  } = api.raidPlan.getById.useQuery({ planId }, { refetchInterval: 5000 });

  const updateEncounterMutation = api.raidPlan.updateEncounter.useMutation({
    onMutate: async (input) => {
      await utils.raidPlan.getById.cancel({ planId });
      const prev = utils.raidPlan.getById.getData({ planId });
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          encounters: old.encounters.map((e) =>
            e.id === input.encounterId
              ? {
                  ...e,
                  ...(input.encounterName !== undefined && {
                    encounterName: input.encounterName,
                  }),
                }
              : e,
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
    },
    onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
  });

  const deleteEncounterMutation = api.raidPlan.deleteEncounter.useMutation({
    onMutate: async (input) => {
      await utils.raidPlan.getById.cancel({ planId });
      const prev = utils.raidPlan.getById.getData({ planId });
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          encounters: old.encounters.filter((e) => e.id !== input.encounterId),
        };
      });
      return { prev };
    },
    onSuccess: () => {
      toast({
        title: "Encounter deleted",
        description: "The encounter has been removed.",
      });
      onEncounterDeleted?.();
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
      toast({
        title: "Error",
        description: _err.message,
        variant: "destructive",
      });
    },
    onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
  });

  const resetEncounterMutation =
    api.raidPlan.resetEncounterToDefault.useMutation({
      onSuccess: (data) => {
        toast({
          title: "Reset to default",
          description: `Encounter groups reset to match default (${data.count} assignments)`,
        });
        void refetch();
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

  const updateCharacterMutation = api.raidPlan.updateCharacter.useMutation();

  const moveCharacterMutation = api.raidPlan.moveCharacter.useMutation({
    onMutate: async (input) => {
      await utils.raidPlan.getById.cancel({ planId });
      const prev = utils.raidPlan.getById.getData({ planId });
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          characters: old.characters.map((c) =>
            c.id === input.planCharacterId
              ? {
                  ...c,
                  defaultGroup: input.targetGroup,
                  defaultPosition: input.targetPosition,
                }
              : c,
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
    },
    onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
  });

  const swapCharactersMutation = api.raidPlan.swapCharacters.useMutation({
    onMutate: async (input) => {
      await utils.raidPlan.getById.cancel({ planId });
      const prev = utils.raidPlan.getById.getData({ planId });
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        const charA = old.characters.find(
          (c) => c.id === input.planCharacterIdA,
        );
        const charB = old.characters.find(
          (c) => c.id === input.planCharacterIdB,
        );
        if (!charA || !charB) return old;
        return {
          ...old,
          characters: old.characters.map((c) => {
            if (c.id === input.planCharacterIdA)
              return {
                ...c,
                defaultGroup: charB.defaultGroup,
                defaultPosition: charB.defaultPosition,
              };
            if (c.id === input.planCharacterIdB)
              return {
                ...c,
                defaultGroup: charA.defaultGroup,
                defaultPosition: charA.defaultPosition,
              };
            return c;
          }),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
    },
    onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
  });

  const addCharacterMutation = api.raidPlan.addCharacter.useMutation();
  const deleteCharacterMutation = api.raidPlan.deleteCharacter.useMutation();

  const moveEncounterCharMutation =
    api.raidPlan.moveEncounterCharacter.useMutation({
      onMutate: async (input) => {
        await utils.raidPlan.getById.cancel({ planId });
        const prev = utils.raidPlan.getById.getData({ planId });
        utils.raidPlan.getById.setData({ planId }, (old) => {
          if (!old) return old;
          const exists = old.encounterAssignments.some(
            (a) =>
              a.encounterId === input.encounterId &&
              a.planCharacterId === input.planCharacterId,
          );
          return {
            ...old,
            encounterAssignments: exists
              ? old.encounterAssignments.map((a) =>
                  a.encounterId === input.encounterId &&
                  a.planCharacterId === input.planCharacterId
                    ? {
                        ...a,
                        groupNumber: input.targetGroup,
                        position: input.targetPosition,
                      }
                    : a,
                )
              : [
                  ...old.encounterAssignments,
                  {
                    encounterId: input.encounterId,
                    planCharacterId: input.planCharacterId,
                    groupNumber: input.targetGroup,
                    position: input.targetPosition,
                  },
                ],
          };
        });
        return { prev };
      },
      onError: (_err, _vars, ctx) => {
        if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
      },
      onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
    });

  const swapEncounterCharsMutation =
    api.raidPlan.swapEncounterCharacters.useMutation({
      onMutate: async (input) => {
        await utils.raidPlan.getById.cancel({ planId });
        const prev = utils.raidPlan.getById.getData({ planId });
        utils.raidPlan.getById.setData({ planId }, (old) => {
          if (!old) return old;

          const defaultAssignment = {
            encounterId: input.encounterId,
            groupNumber: null as number | null,
            position: null as number | null,
          };
          const assignA = old.encounterAssignments.find(
            (a) =>
              a.encounterId === input.encounterId &&
              a.planCharacterId === input.planCharacterIdA,
          ) ?? {
            ...defaultAssignment,
            planCharacterId: input.planCharacterIdA,
          };
          const assignB = old.encounterAssignments.find(
            (a) =>
              a.encounterId === input.encounterId &&
              a.planCharacterId === input.planCharacterIdB,
          ) ?? {
            ...defaultAssignment,
            planCharacterId: input.planCharacterIdB,
          };

          // Build updated assignments, swapping positions
          let updated = old.encounterAssignments.map((a) => {
            if (
              a.encounterId === input.encounterId &&
              a.planCharacterId === input.planCharacterIdA
            )
              return {
                ...a,
                groupNumber: assignB.groupNumber,
                position: assignB.position,
              };
            if (
              a.encounterId === input.encounterId &&
              a.planCharacterId === input.planCharacterIdB
            )
              return {
                ...a,
                groupNumber: assignA.groupNumber,
                position: assignA.position,
              };
            return a;
          });

          // Add new entries for characters that had no encounter assignment
          if (
            !old.encounterAssignments.some(
              (a) =>
                a.encounterId === input.encounterId &&
                a.planCharacterId === input.planCharacterIdA,
            )
          ) {
            updated = [
              ...updated,
              {
                ...assignA,
                groupNumber: assignB.groupNumber,
                position: assignB.position,
              },
            ];
          }
          if (
            !old.encounterAssignments.some(
              (a) =>
                a.encounterId === input.encounterId &&
                a.planCharacterId === input.planCharacterIdB,
            )
          ) {
            updated = [
              ...updated,
              {
                ...assignB,
                groupNumber: assignA.groupNumber,
                position: assignA.position,
              },
            ];
          }

          return { ...old, encounterAssignments: updated };
        });
        return { prev };
      },
      onError: (_err, _vars, ctx) => {
        if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
      },
      onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
    });

  const refreshCharactersMutation = api.raidPlan.refreshCharacters.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Roster refreshed",
        description: `+${data.added} added, ${data.updated} updated, -${data.removed} removed`,
      });
      void refetch();
    },
    onError: (error) => {
      toast({
        title: "Refresh failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePlanMutation = api.raidPlan.update.useMutation({
    onSuccess: () => void refetch(),
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const assignAASlotMutation = api.raidPlan.assignCharacterToAASlot.useMutation(
    {
      onMutate: async (newAssignment) => {
        await utils.raidPlan.getById.cancel({ planId });
        const previousData = utils.raidPlan.getById.getData({ planId });

        utils.raidPlan.getById.setData({ planId }, (old) => {
          if (!old) return old;

          const alreadyExists = old.aaSlotAssignments.some((a) => {
            const contextMatches = newAssignment.encounterId
              ? a.encounterId === newAssignment.encounterId
              : a.raidPlanId === newAssignment.raidPlanId;
            return (
              contextMatches &&
              a.planCharacterId === newAssignment.planCharacterId &&
              a.slotName === newAssignment.slotName
            );
          });

          if (alreadyExists) {
            return old;
          }

          const maxSort = old.aaSlotAssignments
            .filter((a) => a.slotName === newAssignment.slotName)
            .reduce((max, a) => Math.max(max, a.sortOrder), -1);

          return {
            ...old,
            aaSlotAssignments: [
              ...old.aaSlotAssignments,
              {
                id: `temp-${Date.now()}`,
                encounterId: newAssignment.encounterId ?? null,
                raidPlanId: newAssignment.raidPlanId ?? null,
                planCharacterId: newAssignment.planCharacterId,
                slotName: newAssignment.slotName,
                sortOrder: maxSort + 1,
              },
            ],
          };
        });

        return { previousData };
      },
      onError: (error, _variables, context) => {
        if (context?.previousData) {
          utils.raidPlan.getById.setData({ planId }, context.previousData);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlan.getById.invalidate({ planId });
      },
    },
  );

  const removeAASlotMutation =
    api.raidPlan.removeCharacterFromAASlot.useMutation({
      onMutate: async (input) => {
        await utils.raidPlan.getById.cancel({ planId });
        const previousData = utils.raidPlan.getById.getData({ planId });

        utils.raidPlan.getById.setData({ planId }, (old) => {
          if (!old) return old;
          return {
            ...old,
            aaSlotAssignments: old.aaSlotAssignments.filter((a) => {
              const contextMatches = input.encounterId
                ? a.encounterId === input.encounterId
                : a.raidPlanId === input.raidPlanId;

              if (!contextMatches) return true;
              if (a.planCharacterId !== input.planCharacterId) return true;

              if (input.slotName) {
                return a.slotName !== input.slotName;
              }

              return false;
            }),
          };
        });

        return { previousData };
      },
      onError: (error, _variables, context) => {
        if (context?.previousData) {
          utils.raidPlan.getById.setData({ planId }, context.previousData);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlan.getById.invalidate({ planId });
      },
    });

  const reorderAASlotMutation =
    api.raidPlan.reorderAASlotCharacters.useMutation({
      onMutate: async (input) => {
        await utils.raidPlan.getById.cancel({ planId });
        const previousData = utils.raidPlan.getById.getData({ planId });

        utils.raidPlan.getById.setData({ planId }, (old) => {
          if (!old) return old;
          // Build a map of planCharacterId -> new sortOrder from the input
          const orderMap = new Map(
            input.planCharacterIds.map((id, i) => [id, i]),
          );

          return {
            ...old,
            aaSlotAssignments: old.aaSlotAssignments.map((a) => {
              if (a.slotName !== input.slotName) return a;
              const contextMatch = input.encounterId
                ? a.encounterId === input.encounterId
                : a.raidPlanId === input.raidPlanId;
              if (!contextMatch) return a;
              const newOrder = orderMap.get(a.planCharacterId);
              if (newOrder === undefined) return a;
              return { ...a, sortOrder: newOrder };
            }),
          };
        });

        return { previousData };
      },
      onError: (error, _variables, context) => {
        if (context?.previousData) {
          utils.raidPlan.getById.setData({ planId }, context.previousData);
        }
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        void utils.raidPlan.getById.invalidate({ planId });
      },
    });

  const reorderEncountersMutation = api.raidPlan.reorderEncounters.useMutation({
    onMutate: async (input) => {
      await utils.raidPlan.getById.cancel({ planId });
      const prev = utils.raidPlan.getById.getData({ planId });
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        const orderMap = new Map(
          input.encounters.map((e) => [e.id, e.sortOrder]),
        );
        return {
          ...old,
          encounters: old.encounters
            .map((e) => ({
              ...e,
              sortOrder: orderMap.get(e.id) ?? e.sortOrder,
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.raidPlan.getById.setData({ planId }, ctx.prev);
    },
    onSettled: () => void utils.raidPlan.getById.invalidate({ planId }),
  });

  const clearAAAssignmentsMutation =
    api.raidPlan.clearAAAssignmentsForCharacter.useMutation({
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

  const pushDefaultAAMutation =
    api.raidPlan.pushDefaultAAAssignments.useMutation({
      onSuccess: (data) => {
        toast({
          title: "Assignments pushed",
          description: `Pushed ${data.totalSlotsPushed} slot${data.totalSlotsPushed !== 1 ? "s" : ""} to ${data.encounters.length} encounter${data.encounters.length !== 1 ? "s" : ""}`,
        });
        void refetch();
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

  return {
    plan,
    isLoading,
    error,
    refetch,
    utils,
    updateEncounterMutation,
    deleteEncounterMutation,
    resetEncounterMutation,
    updateCharacterMutation,
    moveCharacterMutation,
    swapCharactersMutation,
    addCharacterMutation,
    deleteCharacterMutation,
    moveEncounterCharMutation,
    swapEncounterCharsMutation,
    refreshCharactersMutation,
    updatePlanMutation,
    assignAASlotMutation,
    removeAASlotMutation,
    reorderAASlotMutation,
    clearAAAssignmentsMutation,
    reorderEncountersMutation,
    pushDefaultAAMutation,
  };
}
