import { useState, useCallback } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  buildEncounterCharacters,
  type RaidPlanCharacter,
} from "~/components/raid-planner/types";
import type { useRaidPlanMutations } from "./use-raid-plan-mutations";

type Mutations = ReturnType<typeof useRaidPlanMutations>;

interface UseRaidPlanDragDropOptions {
  mutations: Mutations;
  activeTab: string;
}

export function useRaidPlanDragDrop({
  mutations,
  activeTab,
}: UseRaidPlanDragDropOptions) {
  const {
    plan,
    assignAASlotMutation,
    moveCharacterMutation,
    swapCharactersMutation,
    moveEncounterCharMutation,
    swapEncounterCharsMutation,
  } = mutations;

  const [activeCharacter, setActiveCharacter] =
    useState<RaidPlanCharacter | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const charId = event.active.id as string;
      const char = plan?.characters.find((c) => c.id === charId) as
        | RaidPlanCharacter
        | undefined;
      setActiveCharacter(char ?? null);
    },
    [plan?.characters],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCharacter(null);

      const { active, over } = event;
      if (!over || !plan) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Check if this is an AA slot drop
      if (overId.startsWith("aa-slot:")) {
        const parts = overId.split(":");
        const contextId = parts[1]; // encounterId or raidPlanId
        const slotName = parts.slice(2).join(":"); // Handle slot names with colons

        // Determine if this is for an encounter or the default view
        const isDefaultView = contextId === plan.id;

        assignAASlotMutation.mutate({
          encounterId: isDefaultView ? undefined : contextId,
          raidPlanId: isDefaultView ? contextId : undefined,
          planCharacterId: activeId,
          slotName,
        });
        return;
      }

      // Check if we're on the default tab (allow group drops)
      // or on an encounter tab with useDefaultGroups=false
      const isDefaultTab = activeTab === "default";
      const currentEncounter = plan.encounters.find((e) => e.id === activeTab);
      const allowGroupDrops =
        isDefaultTab ||
        (currentEncounter && !currentEncounter.useDefaultGroups);

      if (!allowGroupDrops) {
        // Don't process group drops when using default groups
        return;
      }

      const activeChar = plan.characters.find((c) => c.id === activeId);
      if (!activeChar) return;

      // Helper to get character at a slot
      const getCharacterAtSlot = (
        group: number,
        position: number,
      ): RaidPlanCharacter | undefined => {
        if (isDefaultTab) {
          return plan.characters.find(
            (c) => c.defaultGroup === group && c.defaultPosition === position,
          ) as RaidPlanCharacter | undefined;
        } else {
          // For encounter tabs, use encounter assignments
          const chars = buildEncounterCharacters(
            plan.characters as RaidPlanCharacter[],
            plan.encounterAssignments,
            activeTab,
          );
          return chars.find(
            (c) => c.defaultGroup === group && c.defaultPosition === position,
          );
        }
      };

      // Handle bench drop
      if (overId === "bench-droppable") {
        if (isDefaultTab) {
          moveCharacterMutation.mutate({
            planCharacterId: activeId,
            targetGroup: null,
            targetPosition: null,
          });
        } else {
          moveEncounterCharMutation.mutate({
            encounterId: activeTab,
            planCharacterId: activeId,
            targetGroup: null,
            targetPosition: null,
          });
        }
        return;
      }

      // Handle group slot drop
      if (overId.startsWith("slot-")) {
        const parts = overId.split("-");
        const targetGroup = parseInt(parts[1]!, 10);
        const targetPosition = parseInt(parts[2]!, 10);

        const targetChar = getCharacterAtSlot(targetGroup, targetPosition);

        if (targetChar) {
          // Swap with occupant
          if (isDefaultTab) {
            swapCharactersMutation.mutate({
              planCharacterIdA: activeId,
              planCharacterIdB: targetChar.id,
            });
          } else {
            swapEncounterCharsMutation.mutate({
              encounterId: activeTab,
              planCharacterIdA: activeId,
              planCharacterIdB: targetChar.id,
            });
          }
        } else {
          // Move to empty slot
          if (isDefaultTab) {
            moveCharacterMutation.mutate({
              planCharacterId: activeId,
              targetGroup,
              targetPosition,
            });
          } else {
            moveEncounterCharMutation.mutate({
              encounterId: activeTab,
              planCharacterId: activeId,
              targetGroup,
              targetPosition,
            });
          }
        }
        return;
      }

      // Dropped on a bench character - swap with them
      const targetChar = plan.characters.find((c) => c.id === overId);
      if (targetChar) {
        if (isDefaultTab) {
          swapCharactersMutation.mutate({
            planCharacterIdA: activeId,
            planCharacterIdB: overId,
          });
        } else {
          swapEncounterCharsMutation.mutate({
            encounterId: activeTab,
            planCharacterIdA: activeId,
            planCharacterIdB: overId,
          });
        }
      }
    },
    [
      plan,
      activeTab,
      assignAASlotMutation,
      moveCharacterMutation,
      swapCharactersMutation,
      moveEncounterCharMutation,
      swapEncounterCharsMutation,
    ],
  );

  return {
    sensors,
    activeCharacter,
    handleDragStart,
    handleDragEnd,
  };
}
