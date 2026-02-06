"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Loader2, X, RotateCcw } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Checkbox } from "~/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { RaidPlanHeader } from "./raid-plan-header";
import {
  RaidPlanGroupsGrid,
  WOW_SERVERS,
  type RaidPlanCharacter,
  type SlotFillEvent,
  type CharacterDeleteEvent,
} from "./raid-plan-groups-grid";
import { AddEncounterDialog } from "./add-encounter-dialog";
import {
  AATemplateRenderer,
  type AASlotAssignment,
} from "./aa-template-renderer";
import {
  renderAATemplate,
  type AACharacterAssignment,
} from "~/lib/aa-template";
import { AATemplateEditor } from "./aa-template-editor";
import { MRTCodec } from "~/lib/mrt-codec";
import { cn } from "~/lib/utils";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { useSession } from "next-auth/react";

interface EncounterAssignment {
  encounterId: string;
  planCharacterId: string;
  groupNumber: number | null;
  position: number | null;
}

function buildEncounterCharacters(
  planCharacters: RaidPlanCharacter[],
  encounterAssignments: EncounterAssignment[],
  encounterId: string,
): RaidPlanCharacter[] {
  const assignmentMap = new Map(
    encounterAssignments
      .filter((a) => a.encounterId === encounterId)
      .map((a) => [a.planCharacterId, a]),
  );

  return planCharacters.map((char) => {
    const assignment = assignmentMap.get(char.id);
    if (assignment) {
      return {
        ...char,
        defaultGroup: assignment.groupNumber,
        defaultPosition: assignment.position,
      };
    }
    // No assignment row = bench for this encounter
    return { ...char, defaultGroup: null, defaultPosition: null };
  });
}

interface RaidPlanDetailProps {
  planId: string;
  initialBreadcrumbData?: { [key: string]: string };
}

export function RaidPlanDetail({
  planId,
  initialBreadcrumbData,
}: RaidPlanDetailProps) {
  const [activeTab, setActiveTab] = useState("default");
  const [deleteEncounterId, setDeleteEncounterId] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [aaCopied, setAACopied] = useState(false);
  const [homeServer, setHomeServer] = useState("");
  // Character replacement confirmation state
  const [pendingCharacterUpdate, setPendingCharacterUpdate] = useState<{
    planCharacterId: string;
    newCharacter: RaidParticipant;
    existingAssignments: { encounterName: string; slotName: string }[];
  } | null>(null);
  // Drag state for shared DndContext
  const [activeCharacter, setActiveCharacter] =
    useState<RaidPlanCharacter | null>(null);
  const { toast } = useToast();
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: session } = useSession();

  const {
    data: plan,
    isLoading,
    error,
    refetch,
  } = api.raidPlan.getById.useQuery({ planId }, { refetchInterval: 5000 });

  // Default home server to the logged-in user's primary character server
  const characterId = session?.user?.characterId;
  const { data: userCharacter } = api.character.getCharacterById.useQuery(
    characterId ?? -1,
    { enabled: !!characterId },
  );

  useEffect(() => {
    if (userCharacter?.server && !homeServer) {
      setHomeServer(userCharacter.server);
    }
  }, [userCharacter?.server, homeServer]);

  // Fetch the zone template for "Reset to Default" functionality
  const { data: zoneTemplate } = api.raidPlanTemplate.getByZoneId.useQuery(
    { zoneId: plan?.zoneId ?? "" },
    { enabled: !!plan?.zoneId },
  );

  // Update breadcrumb to show plan name instead of UUID
  useEffect(() => {
    // Use initial data from server if available (prevents flash)
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    } else if (plan?.name) {
      // Fallback to fetched data
      updateBreadcrumbSegment(planId, plan.name);
    }
  }, [planId, plan?.name, initialBreadcrumbData, updateBreadcrumbSegment]);

  const updateEncounterMutation = api.raidPlan.updateEncounter.useMutation({
    onSuccess: () => {
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

  const deleteEncounterMutation = api.raidPlan.deleteEncounter.useMutation({
    onSuccess: () => {
      toast({
        title: "Encounter deleted",
        description: "The encounter has been removed.",
      });
      setActiveTab("default");
      setDeleteEncounterId(null);
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

  const utils = api.useUtils();
  const updateCharacterMutation = api.raidPlan.updateCharacter.useMutation();
  const moveCharacterMutation = api.raidPlan.moveCharacter.useMutation();
  const swapCharactersMutation = api.raidPlan.swapCharacters.useMutation();
  const addCharacterMutation = api.raidPlan.addCharacter.useMutation();
  const deleteCharacterMutation = api.raidPlan.deleteCharacter.useMutation();
  const moveEncounterCharMutation =
    api.raidPlan.moveEncounterCharacter.useMutation();
  const swapEncounterCharsMutation =
    api.raidPlan.swapEncounterCharacters.useMutation();

  // AA Template mutations
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
        // Cancel outgoing refetches
        await utils.raidPlan.getById.cancel({ planId });

        // Snapshot previous value
        const previousData = utils.raidPlan.getById.getData({ planId });

        // Optimistically update cache - allow multiple slot assignments
        utils.raidPlan.getById.setData({ planId }, (old) => {
          if (!old) return old;

          // Check if character is already in this specific slot (no-op if so)
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

          // Add new assignment with temporary ID
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
        // Rollback on error
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
        // Always refetch after mutation settles
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
              // Match context (encounter or raidPlan)
              const contextMatches = input.encounterId
                ? a.encounterId === input.encounterId
                : a.raidPlanId === input.raidPlanId;

              if (!contextMatches) return true;
              if (a.planCharacterId !== input.planCharacterId) return true;

              // If slotName provided, only remove from that slot
              if (input.slotName) {
                return a.slotName !== input.slotName;
              }

              // No slotName = remove all assignments for this character
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
      onSuccess: () => void refetch(),
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
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

  // Shared DndContext sensors and handlers
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

      // Dropped on a bench character - swap
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

  const handleCharacterUpdate = useCallback(
    (planCharacterId: string, character: RaidParticipant) => {
      // Check if the character has any AA slot assignments
      const aaAssignments = plan?.aaSlotAssignments.filter(
        (a) => a.planCharacterId === planCharacterId,
      );

      if (aaAssignments && aaAssignments.length > 0) {
        // Build the list of assignments for the dialog
        const encounterMap = new Map(
          plan?.encounters.map((e) => [e.id, e.encounterName]) ?? [],
        );
        const assignmentDetails = aaAssignments.map((a) => ({
          encounterName: a.encounterId
            ? (encounterMap.get(a.encounterId) ?? "Unknown")
            : "Default/Trash",
          slotName: a.slotName,
        }));

        // Show confirmation dialog
        setPendingCharacterUpdate({
          planCharacterId,
          newCharacter: character,
          existingAssignments: assignmentDetails,
        });
        return;
      }

      // No AA assignments - proceed directly
      doCharacterUpdate(planCharacterId, character);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.aaSlotAssignments, plan?.encounters],
  );

  // Helper function to perform the actual update (called directly or after confirmation)
  const doCharacterUpdate = useCallback(
    (planCharacterId: string, character: RaidParticipant) => {
      // Convert 0 to null for placeholder names (no linked character)
      const characterId = character.characterId || null;

      // Optimistically update the cache immediately
      const previousData = utils.raidPlan.getById.getData({ planId });

      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          characters: old.characters.map((char) =>
            char.id === planCharacterId
              ? {
                  ...char,
                  characterId,
                  characterName: character.name,
                  class: character.class || null,
                  server: character.server || null,
                }
              : char,
          ),
        };
      });

      // Then perform the mutation
      updateCharacterMutation.mutate(
        {
          planCharacterId,
          characterId,
          characterName: character.name,
        },
        {
          onError: (error) => {
            // Rollback on error
            if (previousData) {
              utils.raidPlan.getById.setData({ planId }, previousData);
            }
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
          },
          onSettled: () => {
            // Refetch to ensure consistency
            void utils.raidPlan.getById.invalidate({ planId });
          },
        },
      );
    },
    [planId, updateCharacterMutation, utils, toast],
  );

  const handleCharacterReplaceConfirm = useCallback(
    (clearAssignments: boolean) => {
      if (!pendingCharacterUpdate) return;

      const { planCharacterId, newCharacter } = pendingCharacterUpdate;

      if (clearAssignments) {
        // Clear AA assignments first, then update
        clearAAAssignmentsMutation.mutate(
          { planCharacterId },
          {
            onSuccess: () => {
              doCharacterUpdate(planCharacterId, newCharacter);
              setPendingCharacterUpdate(null);
            },
          },
        );
      } else {
        // Transfer assignments (just update the character)
        doCharacterUpdate(planCharacterId, newCharacter);
        setPendingCharacterUpdate(null);
      }
    },
    [pendingCharacterUpdate, clearAAAssignmentsMutation, doCharacterUpdate],
  );

  const handleSlotFill = useCallback(
    (event: SlotFillEvent) => {
      // Optimistically update the cache immediately
      const previousData = utils.raidPlan.getById.getData({ planId });

      const tempId = `temp-${Date.now()}`;
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;

        return {
          ...old,
          characters: [
            ...old.characters,
            {
              id: tempId,
              characterId: event.characterId,
              characterName: event.characterName,
              defaultGroup: event.targetGroup,
              defaultPosition: event.targetPosition,
              class: null,
              server: null,
            },
          ],
        };
      });

      // Then perform the mutation
      addCharacterMutation.mutate(
        {
          planId,
          characterId: event.characterId,
          characterName: event.characterName,
          targetGroup: event.targetGroup,
          targetPosition: event.targetPosition,
        },
        {
          onError: (error) => {
            // Rollback on error
            if (previousData) {
              utils.raidPlan.getById.setData({ planId }, previousData);
            }
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
          },
          onSettled: () => {
            // Refetch to ensure consistency and get the real ID
            void utils.raidPlan.getById.invalidate({ planId });
          },
        },
      );
    },
    [planId, addCharacterMutation, utils, toast],
  );

  const handleCharacterDelete = useCallback(
    (event: CharacterDeleteEvent) => {
      // Optimistically update the cache immediately
      const previousData = utils.raidPlan.getById.getData({ planId });

      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;

        return {
          ...old,
          characters: old.characters.filter(
            (char) => char.id !== event.planCharacterId,
          ),
        };
      });

      // Then perform the mutation
      deleteCharacterMutation.mutate(
        {
          planCharacterId: event.planCharacterId,
        },
        {
          onError: (error) => {
            // Rollback on error
            if (previousData) {
              utils.raidPlan.getById.setData({ planId }, previousData);
            }
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
          },
          onSettled: () => {
            // Refetch to ensure consistency
            void utils.raidPlan.getById.invalidate({ planId });
          },
        },
      );
    },
    [planId, deleteCharacterMutation, utils, toast],
  );

  const exportMRT = useCallback(
    (chars: RaidPlanCharacter[]) => {
      // Build MRT raid data: position (1-40) -> character name with server
      const raidData: Record<number, string> = {};

      for (const char of chars) {
        if (char.defaultGroup === null || char.defaultPosition === null)
          continue;
        if (char.defaultGroup > 7) continue; // Only groups 0-7

        // Calculate position: group * 5 + position + 1 (MRT is 1-indexed)
        const position = char.defaultGroup * 5 + char.defaultPosition + 1;

        let name: string;
        if (char.characterId) {
          // Known character: Name-Server format, omit server if it matches home server
          name = char.characterName;
          if (char.server && char.server !== homeServer) {
            name += `-${char.server}`;
          }
        } else {
          // Placeholder/unknown: --Name-- format
          name = `--${char.characterName}--`;
        }

        raidData[position] = name;
      }

      // Encode using MRT codec
      const codec = new MRTCodec();
      const mrtString = codec.encode(raidData);

      // Copy to clipboard
      void navigator.clipboard.writeText(mrtString).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [homeServer],
  );

  const handleExportMRT = useCallback(() => {
    if (!plan) return;
    exportMRT(plan.characters as RaidPlanCharacter[]);
  }, [plan, exportMRT]);

  const handleCopyAA = useCallback(
    (
      template: string | null,
      slotAssignments: AASlotAssignment[],
      characters: RaidPlanCharacter[],
    ) => {
      if (!template) return;

      // Build the assignment map for rendering
      const assignmentMap = new Map<string, AACharacterAssignment[]>();
      for (const assignment of slotAssignments) {
        const char = characters.find(
          (c) => c.id === assignment.planCharacterId,
        );
        if (!char) continue;

        const existing = assignmentMap.get(assignment.slotName) ?? [];
        existing.push({ name: char.characterName, class: char.class });
        assignmentMap.set(assignment.slotName, existing);
      }

      const output = renderAATemplate(template, assignmentMap);
      void navigator.clipboard.writeText(output).then(() => {
        setAACopied(true);
        setTimeout(() => setAACopied(false), 2000);
      });
    },
    [],
  );

  // AA Template handlers
  const handleAAAssign = useCallback(
    (
      planCharacterId: string,
      slotName: string,
      context: { encounterId?: string; raidPlanId?: string },
    ) => {
      assignAASlotMutation.mutate({
        encounterId: context.encounterId,
        raidPlanId: context.raidPlanId,
        planCharacterId,
        slotName,
      });
    },
    [assignAASlotMutation],
  );

  const handleAARemove = useCallback(
    (
      planCharacterId: string,
      slotName: string,
      context: { encounterId?: string; raidPlanId?: string },
    ) => {
      removeAASlotMutation.mutate({
        encounterId: context.encounterId,
        raidPlanId: context.raidPlanId,
        planCharacterId,
        slotName,
      });
    },
    [removeAASlotMutation],
  );

  const handleAAReorder = useCallback(
    (
      slotName: string,
      planCharacterIds: string[],
      context: { encounterId?: string; raidPlanId?: string },
    ) => {
      reorderAASlotMutation.mutate({
        encounterId: context.encounterId,
        raidPlanId: context.raidPlanId,
        slotName,
        planCharacterIds,
      });
    },
    [reorderAASlotMutation],
  );

  const handleDefaultAATemplateSave = useCallback(
    (template: string) => {
      updatePlanMutation.mutate({
        planId,
        defaultAATemplate: template,
      });
    },
    [planId, updatePlanMutation],
  );

  const handleEncounterAATemplateSave = useCallback(
    (encounterId: string, template: string) => {
      updateEncounterMutation.mutate({
        encounterId,
        aaTemplate: template,
      });
    },
    [updateEncounterMutation],
  );

  if (isLoading) {
    return <RaidPlanDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Raid plan not found.</p>
      </div>
    );
  }

  const encounterToDelete = plan.encounters.find(
    (e) => e.id === deleteEncounterId,
  );

  // Determine group count based on zone (20-man raids use 4 groups)
  const is20Man = ["aq20", "zg", "onyxia"].includes(plan.zoneId.toLowerCase());
  const groupCount = is20Man ? 4 : 8;

  return (
    <div className="space-y-6">
      <RaidPlanHeader
        planId={plan.id}
        name={plan.name}
        zoneId={plan.zoneId}
        raidHelperEventId={plan.raidHelperEventId}
        event={plan.event}
        createdAt={plan.createdAt}
        onNameUpdate={refetch}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tabs above two-column layout */}
        <div className="flex items-center gap-2">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="default">Default/Trash</TabsTrigger>
            {plan.encounters.map((encounter) => (
              <TabsTrigger
                key={encounter.id}
                value={encounter.id}
                className={cn(
                  "group relative pr-6",
                  encounter.useDefaultGroups ? "italic opacity-50" : "",
                )}
              >
                {encounter.encounterName}
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 group-data-[state=active]:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteEncounterId(encounter.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </TabsTrigger>
            ))}
          </TabsList>
          <AddEncounterDialog planId={planId} onEncounterCreated={refetch} />
        </div>

        {/* Two-column layout for tab content - wrapped in shared DndContext */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Left column: Group planning */}
            <div>
              {/* Default Tab */}
              <TabsContent value="default" className="mt-0 space-y-3">
                <div className="flex h-7 items-center">
                  <MRTControls
                    onExportMRT={handleExportMRT}
                    mrtCopied={copied}
                    homeServer={homeServer}
                    onHomeServerChange={setHomeServer}
                  />
                </div>
                <RaidPlanGroupsGrid
                  characters={plan.characters as RaidPlanCharacter[]}
                  groupCount={groupCount}
                  editable
                  skipDndContext
                  onCharacterUpdate={handleCharacterUpdate}
                  onSlotFill={handleSlotFill}
                  onCharacterDelete={handleCharacterDelete}
                />
              </TabsContent>

              {/* Encounter Tabs */}
              {plan.encounters.map((encounter) => (
                <TabsContent
                  key={encounter.id}
                  value={encounter.id}
                  className="mt-0 space-y-3"
                >
                  <div className="flex h-7 items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`use-custom-${encounter.id}`}
                        checked={!encounter.useDefaultGroups}
                        onCheckedChange={(checked) => {
                          updateEncounterMutation.mutate({
                            encounterId: encounter.id,
                            useDefaultGroups: checked !== true,
                          });
                        }}
                        disabled={updateEncounterMutation.isPending}
                      />
                      <label
                        htmlFor={`use-custom-${encounter.id}`}
                        className="text-xs font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Use Custom Groups
                      </label>
                      {updateEncounterMutation.isPending && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <MRTControls
                      onExportMRT={() =>
                        exportMRT(
                          buildEncounterCharacters(
                            plan.characters as RaidPlanCharacter[],
                            plan.encounterAssignments,
                            encounter.id,
                          ),
                        )
                      }
                      mrtCopied={copied}
                      homeServer={homeServer}
                      onHomeServerChange={setHomeServer}
                      disabled={encounter.useDefaultGroups}
                    />
                  </div>

                  {encounter.useDefaultGroups ? (
                    <RaidPlanGroupsGrid
                      characters={plan.characters as RaidPlanCharacter[]}
                      groupCount={groupCount}
                      dimmed
                      dragOnly
                      skipDndContext
                    />
                  ) : (
                    <RaidPlanGroupsGrid
                      characters={buildEncounterCharacters(
                        plan.characters as RaidPlanCharacter[],
                        plan.encounterAssignments,
                        encounter.id,
                      )}
                      groupCount={groupCount}
                      editable
                      showEditControls={false}
                      skipDndContext
                    />
                  )}
                </TabsContent>
              ))}
            </div>

            {/* Right column: AA Template */}
            <div className="border-l pl-6">
              {/* Default Tab AA */}
              <TabsContent value="default" className="mt-0 space-y-3">
                <div className="flex h-7 items-center gap-2">
                  <Checkbox
                    id="include-aa-default"
                    checked={plan.useDefaultAA}
                    onCheckedChange={(checked) => {
                      updatePlanMutation.mutate({
                        planId,
                        useDefaultAA: checked === true,
                      });
                    }}
                    disabled={updatePlanMutation.isPending}
                  />
                  <label
                    htmlFor="include-aa-default"
                    className="text-xs font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include AngryEra
                  </label>
                  {updatePlanMutation.isPending && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  {plan.useDefaultAA && plan.defaultAATemplate && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyAA(
                          plan.defaultAATemplate,
                          plan.aaSlotAssignments.filter(
                            (a) => a.raidPlanId === planId,
                          ),
                          plan.characters as RaidPlanCharacter[],
                        )
                      }
                      className="ml-auto h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                    >
                      {aaCopied ? "Copied!" : "Copy AA Text"}
                    </button>
                  )}
                </div>
                {plan.useDefaultAA ? (
                  <>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      AA Preview
                    </h3>
                    <AAPanel
                      template={plan.defaultAATemplate}
                      onSaveTemplate={handleDefaultAATemplateSave}
                      characters={plan.characters as RaidPlanCharacter[]}
                      slotAssignments={plan.aaSlotAssignments.filter(
                        (a) => a.raidPlanId === planId,
                      )}
                      onAssign={(charId, slotName) =>
                        handleAAAssign(charId, slotName, { raidPlanId: planId })
                      }
                      onRemove={(charId, slotName) =>
                        handleAARemove(charId, slotName, { raidPlanId: planId })
                      }
                      onReorder={(slotName, ids) =>
                        handleAAReorder(slotName, ids, { raidPlanId: planId })
                      }
                      contextId={planId}
                      isSaving={updatePlanMutation.isPending}
                      defaultTemplate={zoneTemplate?.defaultAATemplate}
                      onResetToDefault={() => {
                        if (zoneTemplate?.defaultAATemplate) {
                          handleDefaultAATemplateSave(
                            zoneTemplate.defaultAATemplate,
                          );
                        }
                      }}
                      isResetting={updatePlanMutation.isPending}
                    />
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-6">
                    <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                      Check &quot;Include AngryEra&quot; to enable AA
                      assignments
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Encounter Tab AA */}
              {plan.encounters.map((encounter) => (
                <TabsContent
                  key={encounter.id}
                  value={encounter.id}
                  className="mt-0 space-y-3"
                >
                  <div className="flex h-7 items-center gap-2">
                    <Checkbox
                      id={`include-aa-${encounter.id}`}
                      checked={encounter.useCustomAA}
                      onCheckedChange={(checked) => {
                        updateEncounterMutation.mutate({
                          encounterId: encounter.id,
                          useCustomAA: checked === true,
                        });
                      }}
                      disabled={updateEncounterMutation.isPending}
                    />
                    <label
                      htmlFor={`include-aa-${encounter.id}`}
                      className="text-xs font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Include AngryEra
                    </label>
                    {updateEncounterMutation.isPending && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                    {encounter.useCustomAA && encounter.aaTemplate && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyAA(
                            encounter.aaTemplate,
                            plan.aaSlotAssignments.filter(
                              (a) => a.encounterId === encounter.id,
                            ),
                            plan.characters as RaidPlanCharacter[],
                          )
                        }
                        className="ml-auto h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                      >
                        {aaCopied ? "Copied!" : "Copy AA Text"}
                      </button>
                    )}
                  </div>
                  {encounter.useCustomAA ? (
                    <>
                      <h3 className="text-sm font-medium text-muted-foreground">
                        AA Preview
                      </h3>
                      <AAPanel
                        template={encounter.aaTemplate}
                        onSaveTemplate={(template) =>
                          handleEncounterAATemplateSave(encounter.id, template)
                        }
                        characters={plan.characters as RaidPlanCharacter[]}
                        slotAssignments={plan.aaSlotAssignments.filter(
                          (a) => a.encounterId === encounter.id,
                        )}
                        onAssign={(charId, slotName) =>
                          handleAAAssign(charId, slotName, {
                            encounterId: encounter.id,
                          })
                        }
                        onRemove={(charId, slotName) =>
                          handleAARemove(charId, slotName, {
                            encounterId: encounter.id,
                          })
                        }
                        onReorder={(slotName, ids) =>
                          handleAAReorder(slotName, ids, {
                            encounterId: encounter.id,
                          })
                        }
                        contextId={encounter.id}
                        isSaving={updateEncounterMutation.isPending}
                        defaultTemplate={
                          zoneTemplate?.encounters.find(
                            (e) => e.encounterKey === encounter.encounterKey,
                          )?.aaTemplate
                        }
                        onResetToDefault={() => {
                          const templateEncounter =
                            zoneTemplate?.encounters.find(
                              (e) => e.encounterKey === encounter.encounterKey,
                            );
                          if (templateEncounter?.aaTemplate) {
                            handleEncounterAATemplateSave(
                              encounter.id,
                              templateEncounter.aaTemplate,
                            );
                          }
                        }}
                        isResetting={updateEncounterMutation.isPending}
                      />
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6">
                      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                        Check &quot;Include AngryEra&quot; to enable AA
                        assignments
                      </div>
                    </div>
                  )}
                </TabsContent>
              ))}
            </div>
          </div>

          {/* Drag overlay for shared DndContext */}
          <DragOverlay dropAnimation={null}>
            {activeCharacter && (
              <div className="flex items-center gap-1 rounded bg-card px-2 py-1 text-xs font-medium shadow-lg ring-2 ring-primary/50">
                {activeCharacter.class && (
                  <ClassIcon characterClass={activeCharacter.class} px={14} />
                )}
                {activeCharacter.characterName}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </Tabs>

      {/* Delete Encounter Confirmation */}
      <AlertDialog
        open={!!deleteEncounterId}
        onOpenChange={(open) => !open && setDeleteEncounterId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Encounter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;
              {encounterToDelete?.encounterName}&quot;? Any custom assignments
              for this encounter will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEncounterMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteEncounterId) {
                  deleteEncounterMutation.mutate({
                    encounterId: deleteEncounterId,
                  });
                }
              }}
              disabled={deleteEncounterMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEncounterMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Character Replacement Confirmation */}
      <AlertDialog
        open={!!pendingCharacterUpdate}
        onOpenChange={(open) => !open && setPendingCharacterUpdate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Character</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This character has AA assignments in the following encounters:
                </p>
                <ul className="list-inside list-disc text-sm">
                  {pendingCharacterUpdate?.existingAssignments.map((a, i) => (
                    <li key={i}>
                      {a.encounterName} ({a.slotName})
                    </li>
                  ))}
                </ul>
                <p>What would you like to do?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel
              disabled={clearAAAssignmentsMutation.isPending}
              onClick={() => setPendingCharacterUpdate(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleCharacterReplaceConfirm(false)}
              disabled={clearAAAssignmentsMutation.isPending}
            >
              Transfer to {pendingCharacterUpdate?.newCharacter.name}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleCharacterReplaceConfirm(true)}
              disabled={clearAAAssignmentsMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearAAAssignmentsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Clear Assignments"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MRTControls({
  onExportMRT,
  mrtCopied,
  homeServer,
  onHomeServerChange,
  disabled,
}: {
  onExportMRT: () => void;
  mrtCopied: boolean;
  homeServer: string;
  onHomeServerChange: (server: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "ml-auto flex items-center gap-2",
        disabled && "opacity-50",
      )}
    >
      <label className="text-xs text-muted-foreground">My server:</label>
      <select
        value={homeServer}
        onChange={(e) => onHomeServerChange(e.target.value)}
        disabled={disabled}
        className="h-7 rounded-md border bg-background px-2 text-xs"
      >
        <option value="">All servers</option>
        {WOW_SERVERS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onExportMRT}
        disabled={disabled}
        className="h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none"
      >
        {mrtCopied ? "Copied!" : "Copy MRT Export"}
      </button>
    </div>
  );
}

interface AAPanelProps {
  template: string | null;
  onSaveTemplate: (template: string) => void;
  characters: RaidPlanCharacter[];
  slotAssignments: AASlotAssignment[];
  onAssign: (planCharacterId: string, slotName: string) => void;
  onRemove: (planCharacterId: string, slotName: string) => void;
  onReorder: (slotName: string, planCharacterIds: string[]) => void;
  contextId: string;
  isSaving?: boolean;
  defaultTemplate?: string | null;
  onResetToDefault?: () => void;
  isResetting?: boolean;
}

function AAPanel({
  template,
  onSaveTemplate,
  characters,
  slotAssignments,
  onAssign,
  onRemove,
  onReorder,
  contextId,
  isSaving,
  defaultTemplate,
  onResetToDefault,
  isResetting,
}: AAPanelProps) {
  // Check if current template differs from default
  const hasDefaultTemplate = !!defaultTemplate;

  // If no template yet, show editor to create one
  if (!template) {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">
          Create an AA template with <code>{"{assign:SlotName}"}</code>{" "}
          placeholders, then drag characters from the groups to assign them.
        </div>
        {hasDefaultTemplate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResetToDefault?.()}
            disabled={isResetting}
            className="w-full"
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Load Default Template
              </>
            )}
          </Button>
        )}
        <AATemplateEditor
          template=""
          onSave={onSaveTemplate}
          isSaving={isSaving}
        />
      </div>
    );
  }

  // Show full AA interface
  return (
    <div className="space-y-4">
      <AATemplateRenderer
        template={template}
        encounterId={contextId.includes("-") ? contextId : undefined}
        raidPlanId={!contextId.includes("-") ? contextId : undefined}
        characters={characters}
        slotAssignments={slotAssignments}
        onAssign={onAssign}
        onRemove={onRemove}
        onReorder={onReorder}
        skipDndContext
      />

      <AATemplateEditor
        template={template}
        onSave={onSaveTemplate}
        isSaving={isSaving}
        defaultTemplate={defaultTemplate}
        onResetToDefault={onResetToDefault}
        isResetting={isResetting}
      />
    </div>
  );
}

function RaidPlanDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Two-column layout skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>

        {/* Right column */}
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}
