import { useState, useCallback } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  buildEncounterCharacters,
  type RaidPlanCharacter,
} from "~/components/raid-planner/types";
import type { useRaidPlanMutations } from "./use-raid-plan-mutations";

type Mutations = ReturnType<typeof useRaidPlanMutations>;

export type AssignmentDetail = {
  type: "aa" | "encounter-group";
  encounterName: string;
  slotName: string;
};

export type PendingDragOperation = {
  type: "move" | "swap";
  planCharacterId: string;
  targetGroup: number | null;
  targetPosition: number | null;
  targetCharacterId?: string;
  affectedCharacterId: string;
  affectedCharacterName: string;
  affectedCharacterClass?: string;
  transferTargetName?: string;
  transferTargetClass?: string;
  existingAssignments: AssignmentDetail[];
};

interface UseRaidPlanDragDropOptions {
  mutations: Mutations;
  activeTab: string;
}

/**
 * Parse an aa-assigned draggable ID.
 * Format: "aa-assigned:{contextId}:{slotName}:{planCharacterId}"
 * The planCharacterId (UUID) is always the last segment.
 */
function parseAssignedDragId(id: string) {
  const withoutPrefix = id.slice("aa-assigned:".length);
  const segments = withoutPrefix.split(":");
  const charId = segments[segments.length - 1]!;
  const contextId = segments[0]!;
  const slotName = segments.slice(1, -1).join(":");
  return { charId, contextId, slotName };
}

export function useRaidPlanDragDrop({
  mutations,
  activeTab,
}: UseRaidPlanDragDropOptions) {
  const {
    plan,
    assignAASlotMutation,
    removeAASlotMutation,
    reorderAASlotMutation,
    moveCharacterMutation,
    swapCharactersMutation,
    moveEncounterCharMutation,
    swapEncounterCharsMutation,
    clearAAAssignmentsMutation,
    transferEncounterAssignmentsMutation,
    benchEncounterAssignmentsMutation,
  } = mutations;

  const [activeCharacter, setActiveCharacter] =
    useState<RaidPlanCharacter | null>(null);

  const [pendingDragOperation, setPendingDragOperation] =
    useState<PendingDragOperation | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  /**
   * Check if a character has AA assignments or custom encounter group positions.
   * Returns null if no assignments exist.
   */
  const getAssignmentDetails = useCallback(
    (planCharacterId: string): AssignmentDetail[] | null => {
      if (!plan) return null;

      const encounterMap = new Map(
        plan.encounters.map((e) => [e.id, e.encounterName]),
      );

      const details: AssignmentDetail[] = [];

      // AA slot assignments
      const aaAssignments = plan.aaSlotAssignments.filter(
        (a) => a.planCharacterId === planCharacterId,
      );
      for (const a of aaAssignments) {
        details.push({
          type: "aa",
          encounterName: a.encounterId
            ? (encounterMap.get(a.encounterId) ?? "Unknown")
            : "Default/Trash",
          slotName: a.slotName,
        });
      }

      // Custom encounter group positions (encounters with useDefaultGroups=false)
      const customEncounterIds = new Set(
        plan.encounters.filter((e) => !e.useDefaultGroups).map((e) => e.id),
      );
      const encounterGroupAssignments = plan.encounterAssignments.filter(
        (a) =>
          a.planCharacterId === planCharacterId &&
          customEncounterIds.has(a.encounterId) &&
          a.groupNumber !== null,
      );
      for (const a of encounterGroupAssignments) {
        details.push({
          type: "encounter-group",
          encounterName: encounterMap.get(a.encounterId) ?? "Unknown",
          slotName: `Group ${a.groupNumber! + 1}`,
        });
      }

      return details.length > 0 ? details : null;
    },
    [plan],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const rawId = event.active.id as string;
      const charId = rawId.startsWith("aa-assigned:")
        ? parseAssignedDragId(rawId).charId
        : rawId;
      const char = plan?.characters.find((c) => c.id === charId) as
        | RaidPlanCharacter
        | undefined;
      setActiveCharacter(char ?? null);
    },
    [plan?.characters],
  );

  /**
   * Execute a pending drag operation (called after dialog confirmation or directly).
   */
  const executeDragMutation = useCallback(
    (op: PendingDragOperation) => {
      if (op.type === "move") {
        moveCharacterMutation.mutate({
          planCharacterId: op.planCharacterId,
          targetGroup: op.targetGroup,
          targetPosition: op.targetPosition,
        });
      } else if (op.type === "swap" && op.targetCharacterId) {
        swapCharactersMutation.mutate({
          planCharacterIdA: op.planCharacterId,
          planCharacterIdB: op.targetCharacterId,
        });
      }
    },
    [moveCharacterMutation, swapCharactersMutation],
  );

  /**
   * Handle confirmation from the replacement dialog for a pending drag operation.
   */
  const handlePendingDragConfirm = useCallback(
    (action: "transfer" | "clear" | "cancel") => {
      if (!pendingDragOperation) return;

      const op = pendingDragOperation;
      setPendingDragOperation(null);

      if (action === "cancel") {
        return;
      }

      const hasAAAssignments = op.existingAssignments.some(
        (a) => a.type === "aa",
      );
      const hasEncounterGroups = op.existingAssignments.some(
        (a) => a.type === "encounter-group",
      );

      if (action === "clear") {
        // Fire all mutations in parallel — each has optimistic updates
        if (hasAAAssignments) {
          clearAAAssignmentsMutation.mutate({
            planCharacterId: op.affectedCharacterId,
          });
        }
        if (hasEncounterGroups) {
          benchEncounterAssignmentsMutation.mutate({
            planCharacterId: op.affectedCharacterId,
          });
        }
        executeDragMutation(op);
        return;
      }

      if (action === "transfer" && op.type === "swap") {
        // Fire all mutations in parallel — each has optimistic updates
        if (hasAAAssignments) {
          const assignmentsToTransfer = plan?.aaSlotAssignments.filter(
            (a) => a.planCharacterId === op.affectedCharacterId,
          );
          clearAAAssignmentsMutation.mutate({
            planCharacterId: op.affectedCharacterId,
          });
          if (assignmentsToTransfer) {
            for (const assignment of assignmentsToTransfer) {
              assignAASlotMutation.mutate({
                encounterId: assignment.encounterId ?? undefined,
                raidPlanId: assignment.raidPlanId ?? undefined,
                planCharacterId: op.planCharacterId,
                slotName: assignment.slotName,
              });
            }
          }
        }
        if (hasEncounterGroups) {
          transferEncounterAssignmentsMutation.mutate({
            fromPlanCharacterId: op.affectedCharacterId,
            toPlanCharacterId: op.planCharacterId,
          });
        }
        executeDragMutation(op);
        return;
      }
    },
    [
      pendingDragOperation,
      plan?.aaSlotAssignments,
      clearAAAssignmentsMutation,
      assignAASlotMutation,
      transferEncounterAssignmentsMutation,
      benchEncounterAssignmentsMutation,
      executeDragMutation,
    ],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCharacter(null);

      const { active, over } = event;
      const activeId = active.id as string;
      const isSlotCharDrag = activeId.startsWith("aa-assigned:");

      if (!plan) return;

      // Handle dragging an already-assigned slot character
      if (isSlotCharDrag) {
        const {
          charId,
          contextId,
          slotName: sourceSlot,
        } = parseAssignedDragId(activeId);
        const isDefaultView = contextId === plan.id;

        if (over) {
          const overId = over.id as string;

          // Check if the drop target is also an assigned character (reorder)
          if (overId.startsWith("aa-assigned:")) {
            const {
              charId: targetCharId,
              contextId: targetContext,
              slotName: targetSlot,
            } = parseAssignedDragId(overId);
            if (targetSlot === sourceSlot && targetContext === contextId) {
              // Same slot — reorder
              const isDefaultView = contextId === plan.id;
              const slotAssignments = plan.aaSlotAssignments
                .filter((a) => {
                  const contextMatch = isDefaultView
                    ? a.raidPlanId === contextId
                    : a.encounterId === contextId;
                  return contextMatch && a.slotName === sourceSlot;
                })
                .sort((a, b) => a.sortOrder - b.sortOrder);

              const currentIds = slotAssignments.map((a) => a.planCharacterId);
              const oldIndex = currentIds.indexOf(charId);
              const newIndex = currentIds.indexOf(targetCharId);
              if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                const reordered = arrayMove(currentIds, oldIndex, newIndex);
                reorderAASlotMutation.mutate({
                  encounterId: isDefaultView ? undefined : contextId,
                  raidPlanId: isDefaultView ? contextId : undefined,
                  slotName: sourceSlot,
                  planCharacterIds: reordered,
                });
              }
              return;
            }
          }

          if (overId.startsWith("aa-slot:")) {
            const targetSlot = overId.split(":").slice(2).join(":");
            if (targetSlot !== sourceSlot) {
              // Move: remove from source, assign to target
              removeAASlotMutation.mutate({
                encounterId: isDefaultView ? undefined : contextId,
                raidPlanId: isDefaultView ? contextId : undefined,
                planCharacterId: charId,
                slotName: sourceSlot,
              });
              assignAASlotMutation.mutate({
                encounterId: isDefaultView ? undefined : contextId,
                raidPlanId: isDefaultView ? contextId : undefined,
                planCharacterId: charId,
                slotName: targetSlot,
              });
            }
            // Dropped on same slot droppable — no-op (reorder handled above)
          }
        } else {
          // Dropped on dead space — remove from source
          removeAASlotMutation.mutate({
            encounterId: isDefaultView ? undefined : contextId,
            raidPlanId: isDefaultView ? contextId : undefined,
            planCharacterId: charId,
            slotName: sourceSlot,
          });
        }
        return;
      }

      if (!over) return;

      const overId = over.id as string;

      // Check if this is an AA slot drop (roster char → slot)
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
          // Check if the character being moved to bench has AA assignments
          const assignments = getAssignmentDetails(activeId);
          if (assignments) {
            setPendingDragOperation({
              type: "move",
              planCharacterId: activeId,
              targetGroup: null,
              targetPosition: null,
              affectedCharacterId: activeId,
              affectedCharacterName:
                (activeChar as RaidPlanCharacter).characterName ?? "Unknown",
              affectedCharacterClass:
                (activeChar as RaidPlanCharacter).class ?? undefined,
              existingAssignments: assignments,
            });
            return;
          }
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
            // Only check AA assignments when bench is involved
            // (bench → group displaces occupant to bench)
            const activeIsOnBench =
              (activeChar as RaidPlanCharacter).defaultGroup === null;
            if (activeIsOnBench) {
              const assignments = getAssignmentDetails(targetChar.id);
              if (assignments) {
                setPendingDragOperation({
                  type: "swap",
                  planCharacterId: activeId,
                  targetGroup,
                  targetPosition,
                  targetCharacterId: targetChar.id,
                  affectedCharacterId: targetChar.id,
                  affectedCharacterName: targetChar.characterName ?? "Unknown",
                  affectedCharacterClass: targetChar.class ?? undefined,
                  transferTargetName:
                    (activeChar as RaidPlanCharacter).characterName ??
                    "Unknown",
                  transferTargetClass:
                    (activeChar as RaidPlanCharacter).class ?? undefined,
                  existingAssignments: assignments,
                });
                return;
              }
            }
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
          // Only check AA assignments when a group character is going to bench
          const activeIsInGroup =
            (activeChar as RaidPlanCharacter).defaultGroup !== null;
          if (activeIsInGroup) {
            const assignments = getAssignmentDetails(activeId);
            if (assignments) {
              setPendingDragOperation({
                type: "swap",
                planCharacterId: activeId,
                targetGroup: null,
                targetPosition: null,
                targetCharacterId: targetChar.id,
                affectedCharacterId: activeId,
                affectedCharacterName:
                  (activeChar as RaidPlanCharacter).characterName ?? "Unknown",
                affectedCharacterClass:
                  (activeChar as RaidPlanCharacter).class ?? undefined,
                transferTargetName:
                  (targetChar as RaidPlanCharacter).characterName ?? "Unknown",
                transferTargetClass:
                  (targetChar as RaidPlanCharacter).class ?? undefined,
                existingAssignments: assignments,
              });
              return;
            }
          }
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
      removeAASlotMutation,
      reorderAASlotMutation,
      moveCharacterMutation,
      swapCharactersMutation,
      moveEncounterCharMutation,
      swapEncounterCharsMutation,
      getAssignmentDetails,
    ],
  );

  return {
    sensors,
    activeCharacter,
    handleDragStart,
    handleDragEnd,
    pendingDragOperation,
    setPendingDragOperation,
    handlePendingDragConfirm,
  };
}
