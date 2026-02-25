import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import {
  renderAATemplate,
  type AACharacterAssignment,
} from "~/lib/aa-template";
import { MRTCodec } from "~/lib/mrt-codec";
import { AACodec } from "~/lib/aa-codec";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import {
  type RaidPlanCharacter,
  type AASlotAssignment,
  type SlotFillEvent,
  type CharacterDeleteEvent,
} from "~/components/raid-planner/types";
import { VALID_WRITE_IN_CLASSES } from "~/components/raid-planner/constants";
import type { useRaidPlanMutations } from "./use-raid-plan-mutations";

type Mutations = ReturnType<typeof useRaidPlanMutations>;

interface UseRaidPlanHandlersOptions {
  planId: string;
  mutations: Mutations;
}

export function useRaidPlanHandlers({
  planId,
  mutations,
}: UseRaidPlanHandlersOptions) {
  const {
    plan,
    utils,
    updateCharacterMutation,
    addCharacterMutation,
    deleteCharacterMutation,
    clearAAAssignmentsMutation,
    removeAASlotMutation,
    reorderAASlotMutation,
    updatePlanMutation,
    updateEncounterMutation,
    refreshCharactersMutation,
    assignAASlotMutation,
  } = mutations;

  const { toast } = useToast();
  const { data: session } = useSession();

  // State
  const [pendingCharacterUpdate, setPendingCharacterUpdate] = useState<{
    planCharacterId: string;
    newCharacter: RaidParticipant;
    affectedCharacterName: string;
    affectedCharacterClass?: string;
    existingAssignments: {
      type: "aa" | "encounter-group";
      encounterName: string;
      slotName: string;
    }[];
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshDialog, setShowRefreshDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aaCopied, setAACopied] = useState(false);
  const [isExportingAA, setIsExportingAA] = useState(false);
  const [homeServer, setHomeServer] = useState("");

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
          writeInClass: characterId ? null : character.class || null,
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
          type: "aa" as const,
          encounterName: a.encounterId
            ? (encounterMap.get(a.encounterId) ?? "Unknown")
            : "Default/Trash",
          slotName: a.slotName,
        }));

        // Show confirmation dialog
        const existingChar = plan?.characters.find(
          (c) => c.id === planCharacterId,
        );
        setPendingCharacterUpdate({
          planCharacterId,
          newCharacter: character,
          affectedCharacterName: existingChar?.characterName ?? "Unknown",
          affectedCharacterClass: existingChar?.class ?? undefined,
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
              class: event.writeInClass ?? null,
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
          writeInClass: event.writeInClass ?? null,
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
          // Placeholder/unknown: Name? format
          name = `${char.characterName}?`;
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

  const handleRefreshFromRaidhelper = useCallback(
    async (mode: "fullReimport" | "addNewSignupsToBench" = "fullReimport") => {
      if (!plan?.raidHelperEventId) return;
      setIsRefreshing(true);
      try {
        // 1. Fetch current event details from Raidhelper
        const eventDetails = await utils.raidHelper.getEventDetails.fetch({
          eventId: plan.raidHelperEventId,
        });

        // 2. Build signups for matching (same transform as raid-helper-import)
        const allSignups = [
          ...eventDetails.signups.assigned,
          ...eventDetails.signups.unassigned,
        ];
        const signupsForMatching = allSignups.map((s) => ({
          userId: s.userId,
          discordName: s.name,
          className: s.className,
          specName: s.specName,
          partyId: s.partyId,
          slotId: s.slotId,
        }));

        // 3. Match signups to database characters
        const matchResults =
          await utils.raidHelper.matchSignupsToCharacters.fetch({
            signups: signupsForMatching,
          });

        // 4. Transform match results to characters array (same as handleCreatePlan)
        const characters = matchResults
          .filter((r) => {
            const lowerClass = r.className.toLowerCase();
            return lowerClass !== "absent" && lowerClass !== "absence";
          })
          .map((r) => {
            const defaultGroup =
              r.partyId !== null && r.partyId <= 8 ? r.partyId - 1 : null;
            const defaultPosition =
              defaultGroup !== null && r.slotId !== null ? r.slotId - 1 : null;
            const characterName =
              r.status === "matched" && r.matchedCharacter
                ? r.matchedCharacter.characterName
                : r.discordName;
            const characterId =
              r.status === "matched" && r.matchedCharacter
                ? r.matchedCharacter.characterId
                : null;
            const normalizedClass = r.className
              ? r.className.charAt(0).toUpperCase() +
                r.className.slice(1).toLowerCase()
              : null;
            const writeInClass =
              !characterId &&
              normalizedClass &&
              VALID_WRITE_IN_CLASSES.has(normalizedClass)
                ? normalizedClass
                : null;
            return {
              characterId,
              characterName,
              defaultGroup,
              defaultPosition,
              writeInClass,
            };
          });

        // 5. Call the refresh mutation
        refreshCharactersMutation.mutate({
          planId: plan.id,
          mode,
          characters,
        });
      } catch (err) {
        toast({
          title: "Refresh failed",
          description:
            err instanceof Error
              ? err.message
              : "Failed to fetch from Raidhelper",
          variant: "destructive",
        });
      } finally {
        setIsRefreshing(false);
      }
    },
    [
      plan?.raidHelperEventId,
      plan?.id,
      utils,
      refreshCharactersMutation,
      toast,
    ],
  );

  const handleCopyAA = useCallback(
    (
      template: string | null,
      slotAssignments: AASlotAssignment[],
      characters: RaidPlanCharacter[],
    ) => {
      if (!template) return;

      // Build the assignment map for rendering
      const assignmentMap = new Map<string, AACharacterAssignment[]>();
      const sorted = [...slotAssignments].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      for (const assignment of sorted) {
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

  const handleExportAllAA = useCallback(async () => {
    if (!plan) return;
    setIsExportingAA(true);
    try {
      const children: any[] = [];
      const raidPlanCharacters = plan.characters as RaidPlanCharacter[];

      // 1. Add Trash/General page if enabled
      if (plan.useDefaultAA && plan.defaultAATemplate) {
        const defaultAssignments = plan.aaSlotAssignments
          .filter((a) => !a.encounterId && a.raidPlanId === plan.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const assignmentMap = new Map<string, AACharacterAssignment[]>();
        for (const assignment of defaultAssignments) {
          const char = raidPlanCharacters.find(
            (c) => c.id === assignment.planCharacterId,
          );
          if (!char) continue;

          const existing = assignmentMap.get(assignment.slotName) ?? [];
          existing.push({ name: char.characterName, class: char.class });
          assignmentMap.set(assignment.slotName, existing);
        }

        const renderedContents = renderAATemplate(
          plan.defaultAATemplate,
          assignmentMap,
        );
        children.push({
          Type: "Page",
          Name: "Trash/General",
          Contents: renderedContents,
          Index: 0,
        });
      }

      // 2. Add Encounter pages if enabled
      const sortedEncounters = [...plan.encounters].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );

      for (const encounter of sortedEncounters) {
        // Skip if AA is not enabled for this encounter
        if (!encounter.useCustomAA || !encounter.aaTemplate) continue;

        const template = encounter.aaTemplate;

        // 2. Build the assignment map for this encounter
        const encounterAssignments = plan.aaSlotAssignments
          .filter((a) => a.encounterId === encounter.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const assignmentMap = new Map<string, AACharacterAssignment[]>();
        for (const assignment of encounterAssignments) {
          const char = raidPlanCharacters.find(
            (c) => c.id === assignment.planCharacterId,
          );
          if (!char) continue;

          const existing = assignmentMap.get(assignment.slotName) ?? [];
          existing.push({ name: char.characterName, class: char.class });
          assignmentMap.set(assignment.slotName, existing);
        }

        // 3. Render contents
        const renderedContents = renderAATemplate(template, assignmentMap);

        // 4. Add to children
        children.push({
          Type: "Page",
          Name: encounter.encounterName,
          Contents: renderedContents,
          Index: encounter.sortOrder + 1,
        });
      }

      if (children.length === 0) {
        throw new Error("No AA pages were found to export.");
      }

      const exportData = {
        Type: "Category",
        Name: plan.name,
        Children: children,
      };

      const codec = new AACodec();
      const exportString = codec.encode(exportData, "Category");

      await navigator.clipboard.writeText(exportString);
      toast({
        title: "Copied Encoded AAs!",
        description: (
          <>
            Import <strong>{plan.name}</strong> ({children.length} page
            {children.length !== 1 ? "s" : ""}) into Angry Era using Menu &gt;
            Import &gt; Encoded AA.
          </>
        ),
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description:
          err instanceof Error ? err.message : "Failed to export AAs",
        variant: "destructive",
      });
    } finally {
      setIsExportingAA(false);
    }
  }, [plan, toast]);

  return {
    // State
    pendingCharacterUpdate,
    setPendingCharacterUpdate,
    isRefreshing,
    showRefreshDialog,
    setShowRefreshDialog,
    copied,
    aaCopied,
    homeServer,
    setHomeServer,
    // Handlers
    handleCharacterUpdate,
    handleCharacterReplaceConfirm,
    handleSlotFill,
    handleCharacterDelete,
    exportMRT,
    handleExportMRT,
    handleRefreshFromRaidhelper,
    handleCopyAA,
    handleAAAssign,
    handleAARemove,
    handleAAReorder,
    handleDefaultAATemplateSave,
    handleEncounterAATemplateSave,
    handleExportAllAA,
    isExportingAA,
  };
}
