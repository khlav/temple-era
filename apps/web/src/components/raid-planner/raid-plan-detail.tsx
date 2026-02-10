"use client";

import { useState, useEffect } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Loader2, X, RotateCcw, RefreshCw } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { RaidPlanHeader } from "./raid-plan-header";
import { RaidPlanGroupsGrid } from "./raid-plan-groups-grid";
import { AddEncounterDialog } from "./add-encounter-dialog";
import { MRTControls } from "./mrt-controls";
import { AAPanel } from "./aa-panel";
import { RaidPlanDetailSkeleton } from "./skeletons";
import { DeleteEncounterDialog } from "./delete-encounter-dialog";
import { CharacterReplacementDialog } from "./character-replacement-dialog";
import { RefreshConfirmDialog } from "./refresh-confirm-dialog";
import { CUSTOM_ZONE_ID, RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { cn } from "~/lib/utils";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { useRaidPlanMutations } from "~/hooks/use-raid-plan-mutations";
import { useRaidPlanDragDrop } from "~/hooks/use-raid-plan-drag-drop";
import { useRaidPlanHandlers } from "~/hooks/use-raid-plan-handlers";
import { buildEncounterCharacters, type RaidPlanCharacter } from "./types";
import { getGroupCount } from "./constants";

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
  const { updateBreadcrumbSegment } = useBreadcrumb();

  const mutations = useRaidPlanMutations({
    planId,
    onEncounterDeleted: () => {
      setActiveTab("default");
      setDeleteEncounterId(null);
    },
  });

  const {
    plan,
    isLoading,
    error,
    refetch,
    deleteEncounterMutation,
    updateEncounterMutation,
    resetEncounterMutation,
    updatePlanMutation,
    clearAAAssignmentsMutation,
    refreshCharactersMutation,
  } = mutations;

  // Fetch the zone template for "Reset to Default" functionality (skip for custom zones)
  const { data: zoneTemplate } = api.raidPlanTemplate.getByZoneId.useQuery(
    { zoneId: plan?.zoneId ?? "" },
    { enabled: !!plan?.zoneId && plan.zoneId !== CUSTOM_ZONE_ID },
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

  const { sensors, activeCharacter, handleDragStart, handleDragEnd } =
    useRaidPlanDragDrop({ mutations, activeTab });

  const {
    pendingCharacterUpdate,
    setPendingCharacterUpdate,
    isRefreshing,
    showRefreshDialog,
    setShowRefreshDialog,
    copied,
    aaCopied,
    homeServer,
    setHomeServer,
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
  } = useRaidPlanHandlers({ planId, mutations });

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

  const groupCount = getGroupCount(plan.zoneId);
  const zoneName =
    RAID_ZONE_CONFIG.find((z) => z.instance === plan.zoneId)?.name ??
    plan.zoneId;

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
                  {plan.raidHelperEventId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 border-destructive text-xs"
                      disabled={
                        isRefreshing || refreshCharactersMutation.isPending
                      }
                      onClick={() => setShowRefreshDialog(true)}
                    >
                      {isRefreshing || refreshCharactersMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                      )}
                      Reimport
                    </Button>
                  )}
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
                    <div className="flex items-center gap-1.5">
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
                      {!encounter.useDefaultGroups && (
                        <button
                          type="button"
                          onClick={() => {
                            resetEncounterMutation.mutate({
                              encounterId: encounter.id,
                            });
                          }}
                          disabled={resetEncounterMutation.isPending}
                          className="ml-1 flex h-5 items-center gap-0.5 rounded border border-muted-foreground/30 px-1.5 text-[10px] text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50 disabled:opacity-50"
                          title="Reset to default groups"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          Reset
                        </button>
                      )}
                      {(updateEncounterMutation.isPending ||
                        resetEncounterMutation.isPending) && (
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
                      locked
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
                    contextLabel="Default/Trash"
                    zoneName={zoneName}
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
                      contextLabel={encounter.encounterName}
                      zoneName={zoneName}
                      isSaving={updateEncounterMutation.isPending}
                      defaultTemplate={
                        zoneTemplate?.encounters.find(
                          (e) => e.encounterKey === encounter.encounterKey,
                        )?.aaTemplate
                      }
                      onResetToDefault={() => {
                        const templateEncounter = zoneTemplate?.encounters.find(
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

      <DeleteEncounterDialog
        open={!!deleteEncounterId}
        onOpenChange={(open) => !open && setDeleteEncounterId(null)}
        encounterName={encounterToDelete?.encounterName}
        isPending={deleteEncounterMutation.isPending}
        onDelete={() => {
          if (deleteEncounterId) {
            deleteEncounterMutation.mutate({
              encounterId: deleteEncounterId,
            });
          }
        }}
      />

      <CharacterReplacementDialog
        open={!!pendingCharacterUpdate}
        onOpenChange={(open) => !open && setPendingCharacterUpdate(null)}
        existingAssignments={pendingCharacterUpdate?.existingAssignments}
        newCharacterName={pendingCharacterUpdate?.newCharacter.name}
        isPending={clearAAAssignmentsMutation.isPending}
        onTransfer={() => handleCharacterReplaceConfirm(false)}
        onClearAssignments={() => handleCharacterReplaceConfirm(true)}
        onCancel={() => setPendingCharacterUpdate(null)}
      />

      <RefreshConfirmDialog
        open={showRefreshDialog}
        onOpenChange={(open) => !open && setShowRefreshDialog(false)}
        isPending={isRefreshing || refreshCharactersMutation.isPending}
        onConfirm={() => {
          setShowRefreshDialog(false);
          void handleRefreshFromRaidhelper();
        }}
      />
    </div>
  );
}
