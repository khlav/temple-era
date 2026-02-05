"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, X } from "lucide-react";
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
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { RaidPlanHeader } from "./raid-plan-header";
import {
  RaidPlanGroupsGrid,
  WOW_SERVERS,
  type RaidPlanCharacter,
  type CharacterMoveEvent,
  type CharacterSwapEvent,
  type SlotFillEvent,
  type CharacterDeleteEvent,
} from "./raid-plan-groups-grid";
import { AddEncounterDialog } from "./add-encounter-dialog";
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
  const [homeServer, setHomeServer] = useState("");
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

  const handleCharacterUpdate = useCallback(
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

  const handleCharacterMove = useCallback(
    (event: CharacterMoveEvent) => {
      // Optimistically update the cache immediately
      const previousData = utils.raidPlan.getById.getData({ planId });

      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;

        return {
          ...old,
          characters: old.characters.map((char) =>
            char.id === event.planCharacterId
              ? {
                  ...char,
                  defaultGroup: event.targetGroup,
                  defaultPosition: event.targetPosition,
                }
              : char,
          ),
        };
      });

      // Then perform the mutation
      moveCharacterMutation.mutate(
        {
          planCharacterId: event.planCharacterId,
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
            // Refetch to ensure consistency
            void utils.raidPlan.getById.invalidate({ planId });
          },
        },
      );
    },
    [planId, moveCharacterMutation, utils, toast],
  );

  const handleCharacterSwap = useCallback(
    (event: CharacterSwapEvent) => {
      // Optimistically update the cache immediately
      const previousData = utils.raidPlan.getById.getData({ planId });

      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;

        const charAIndex = old.characters.findIndex(
          (c) => c.id === event.planCharacterIdA,
        );
        const charBIndex = old.characters.findIndex(
          (c) => c.id === event.planCharacterIdB,
        );
        if (charAIndex === -1 || charBIndex === -1) return old;

        const charA = old.characters[charAIndex]!;
        const charB = old.characters[charBIndex]!;

        const updatedCharacters = [...old.characters];
        // Swap their positions
        updatedCharacters[charAIndex] = {
          ...charA,
          defaultGroup: charB.defaultGroup,
          defaultPosition: charB.defaultPosition,
        };
        updatedCharacters[charBIndex] = {
          ...charB,
          defaultGroup: charA.defaultGroup,
          defaultPosition: charA.defaultPosition,
        };

        return {
          ...old,
          characters: updatedCharacters,
        };
      });

      // Then perform the mutation
      swapCharactersMutation.mutate(
        {
          planCharacterIdA: event.planCharacterIdA,
          planCharacterIdB: event.planCharacterIdB,
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
    [planId, swapCharactersMutation, utils, toast],
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

  const handleEncounterCharacterMove = useCallback(
    (encounterId: string, event: CharacterMoveEvent) => {
      const previousData = utils.raidPlan.getById.getData({ planId });

      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          encounterAssignments: old.encounterAssignments.map((a) =>
            a.encounterId === encounterId &&
            a.planCharacterId === event.planCharacterId
              ? {
                  ...a,
                  groupNumber: event.targetGroup,
                  position: event.targetPosition,
                }
              : a,
          ),
        };
      });

      moveEncounterCharMutation.mutate(
        {
          encounterId,
          planCharacterId: event.planCharacterId,
          targetGroup: event.targetGroup,
          targetPosition: event.targetPosition,
        },
        {
          onError: (error) => {
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
            void utils.raidPlan.getById.invalidate({ planId });
          },
        },
      );
    },
    [planId, moveEncounterCharMutation, utils, toast],
  );

  const handleEncounterCharacterSwap = useCallback(
    (encounterId: string, event: CharacterSwapEvent) => {
      const previousData = utils.raidPlan.getById.getData({ planId });

      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;

        const assignments = [...old.encounterAssignments];
        const idxA = assignments.findIndex(
          (a) =>
            a.encounterId === encounterId &&
            a.planCharacterId === event.planCharacterIdA,
        );
        const idxB = assignments.findIndex(
          (a) =>
            a.encounterId === encounterId &&
            a.planCharacterId === event.planCharacterIdB,
        );
        if (idxA === -1 || idxB === -1) return old;

        const aAssign = assignments[idxA]!;
        const bAssign = assignments[idxB]!;

        assignments[idxA] = {
          ...aAssign,
          groupNumber: bAssign.groupNumber,
          position: bAssign.position,
        };
        assignments[idxB] = {
          ...bAssign,
          groupNumber: aAssign.groupNumber,
          position: aAssign.position,
        };

        return { ...old, encounterAssignments: assignments };
      });

      swapEncounterCharsMutation.mutate(
        {
          encounterId,
          planCharacterIdA: event.planCharacterIdA,
          planCharacterIdB: event.planCharacterIdB,
        },
        {
          onError: (error) => {
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
            void utils.raidPlan.getById.invalidate({ planId });
          },
        },
      );
    },
    [planId, swapEncounterCharsMutation, utils, toast],
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
                className="group relative pr-6"
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

        {/* Two-column layout for tab content */}
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
                onCharacterUpdate={handleCharacterUpdate}
                onCharacterMove={handleCharacterMove}
                onCharacterSwap={handleCharacterSwap}
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
                      id={`use-default-${encounter.id}`}
                      checked={encounter.useDefaultGroups}
                      onCheckedChange={(checked) => {
                        updateEncounterMutation.mutate({
                          encounterId: encounter.id,
                          useDefaultGroups: checked === true,
                        });
                      }}
                      disabled={updateEncounterMutation.isPending}
                    />
                    <label
                      htmlFor={`use-default-${encounter.id}`}
                      className="text-xs font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Use Default Groups
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
                    onCharacterMove={(event) =>
                      handleEncounterCharacterMove(encounter.id, event)
                    }
                    onCharacterSwap={(event) =>
                      handleEncounterCharacterSwap(encounter.id, event)
                    }
                  />
                )}
              </TabsContent>
            ))}
          </div>

          {/* Right column: Future content (per-encounter) */}
          <div className="rounded-lg border border-dashed p-6">
            <div className="flex h-full min-h-[300px] items-center justify-center text-muted-foreground">
              {/* Placeholder for future content */}
            </div>
          </div>
        </div>
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
