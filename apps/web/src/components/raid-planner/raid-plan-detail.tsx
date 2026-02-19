"use client";

import { useState, useEffect } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
  Loader2,
  X,
  RotateCcw,
  RefreshCw,
  ArrowRightFromLine,
  Eye,
  EyeOff,
} from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { RaidPlanHeader } from "./raid-plan-header";
import { RaidPlanGroupsGrid } from "./raid-plan-groups-grid";
import { AddEncounterDialog } from "./add-encounter-dialog";
import { ManageEncountersDialog } from "./manage-encounters-dialog";
import { EncounterTabNav } from "./encounter-tab-nav";
import { MRTControls } from "./mrt-controls";
import { AAPanel } from "./aa-panel";
import { RaidPlanDetailSkeleton } from "./skeletons";
import { DeleteEncounterDialog } from "./delete-encounter-dialog";
import { CharacterReplacementDialog } from "./character-replacement-dialog";
import { RefreshConfirmDialog } from "./refresh-confirm-dialog";
import { PushDefaultAADialog } from "./push-default-aa-dialog";
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
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [showDefaultAARef, setShowDefaultAARef] = useState(false);
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
    reorderEncountersMutation,
    pushDefaultAAMutation,
  } = mutations;

  const utils = api.useUtils();
  const createEncounterMutation = api.raidPlan.createEncounter.useMutation({
    onSuccess: () => void refetch(),
  });
  const togglePublicMutation = api.raidPlan.togglePublic.useMutation({
    onMutate: async ({ isPublic }) => {
      await utils.raidPlan.getById.cancel({ planId });
      const prev = utils.raidPlan.getById.getData({ planId });
      if (prev) {
        utils.raidPlan.getById.setData({ planId }, { ...prev, isPublic });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        utils.raidPlan.getById.setData({ planId }, context.prev);
      }
    },
    onSettled: () => {
      void utils.raidPlan.getById.invalidate({ planId });
    },
  });

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

  const {
    sensors,
    activeCharacter,
    handleDragStart,
    handleDragEnd,
    pendingDragOperation,
    setPendingDragOperation,
    handlePendingDragConfirm,
  } = useRaidPlanDragDrop({ mutations, activeTab });

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
    handleExportAllAA,
    isExportingAA,
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
        startAt={plan.startAt}
        event={plan.event}
        onNameUpdate={refetch}
        isPublic={plan.isPublic}
        onTogglePublic={(isPublic) =>
          togglePublicMutation.mutate({ planId, isPublic })
        }
        onZoneUpdate={refetch}
        onExportAllAA={handleExportAllAA}
        isExportingAA={isExportingAA}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tabs above two-column layout */}
        <EncounterTabNav
          encounters={plan.encounters}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          leftActions={
            <AddEncounterDialog planId={planId} onEncounterCreated={refetch} />
          }
          actions={
            <ManageEncountersDialog
              encounters={plan.encounters.map((e) => ({
                id: e.id,
                encounterName: e.encounterName,
                sortOrder: e.sortOrder,
              }))}
              onSave={(encounters) => {
                // Handle reorder
                reorderEncountersMutation.mutate({
                  encounters: encounters.map((e) => ({
                    id: e.id,
                    sortOrder: e.sortOrder,
                  })),
                });
                // Handle renames
                encounters.forEach((e) => {
                  if (e.encounterName) {
                    updateEncounterMutation.mutate({
                      encounterId: e.id,
                      encounterName: e.encounterName,
                    });
                  }
                });
              }}
              onDelete={(encounterId) => setDeleteEncounterId(encounterId)}
              onAdd={(encounterName) =>
                createEncounterMutation.mutate({ planId, encounterName })
              }
              isPending={reorderEncountersMutation.isPending}
              isDeletePending={deleteEncounterMutation.isPending}
              isAddPending={createEncounterMutation.isPending}
            />
          }
        />

        {/* Two-column layout for tab content - wrapped in shared DndContext */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            className={cn(
              "mt-4 grid gap-6",
              showDefaultAARef && activeTab !== "default"
                ? "lg:grid-cols-[1fr_1fr_0.6fr]"
                : "lg:grid-cols-2",
            )}
          >
            {/* Groups Column (order 2 on mobile, 1 on desktop) */}
            <div className="order-2 lg:order-1">
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

            {/* AA Column (order 1 on mobile, 2 on desktop) */}
            <div className="order-1 lg:order-2 lg:border-l lg:pl-6">
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
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowPushDialog(true)}
                        className="flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs hover:bg-accent hover:text-accent-foreground"
                      >
                        <ArrowRightFromLine className="h-3 w-3" />
                        Push to Encounters
                      </button>
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
                        className="h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                      >
                        {aaCopied ? "Copied!" : "Copy AA Text"}
                      </button>
                    </div>
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
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowDefaultAARef((v) => !v)}
                        className={cn(
                          "flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors",
                          showDefaultAARef
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                        title={
                          showDefaultAARef
                            ? "Hide default AA reference"
                            : "Show default AA reference"
                        }
                      >
                        {showDefaultAARef ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        Default AA
                      </button>
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
                          className="h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                        >
                          {aaCopied ? "Copied!" : "Copy AA Text"}
                        </button>
                      )}
                    </div>
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

            {/* 3rd column: Default AA Reference (compact, read-only) */}
            {showDefaultAARef && activeTab !== "default" && (
              <div className="order-3 border-l pl-4 lg:order-3">
                <div className="sticky top-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Default AA Reference
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowDefaultAARef(false)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {plan.useDefaultAA && plan.defaultAATemplate ? (
                    <div className="w-[133.33%] origin-top-left scale-75">
                      <AAPanel
                        template={plan.defaultAATemplate}
                        characters={plan.characters as RaidPlanCharacter[]}
                        slotAssignments={plan.aaSlotAssignments.filter(
                          (a) => a.raidPlanId === planId,
                        )}
                        contextId={`${planId}-ref`}
                        contextLabel="Default (Reference)"
                        zoneName={zoneName}
                        readOnly
                      />
                    </div>
                  ) : (
                    <div className="rounded border border-dashed p-3">
                      <p className="text-center text-[11px] text-muted-foreground">
                        No default AA configured
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Drag overlay for shared DndContext */}
          <DragOverlay dropAnimation={null}>
            {activeCharacter && (
              <div className="flex w-max items-center gap-1 whitespace-nowrap rounded bg-card px-2 py-1 text-xs font-medium shadow-lg ring-2 ring-primary/50">
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
        affectedCharacterName={pendingCharacterUpdate?.affectedCharacterName}
        affectedCharacterClass={pendingCharacterUpdate?.affectedCharacterClass}
        newCharacterName={pendingCharacterUpdate?.newCharacter.name}
        newCharacterClass={pendingCharacterUpdate?.newCharacter.class}
        isPending={clearAAAssignmentsMutation.isPending}
        onTransfer={() => handleCharacterReplaceConfirm(false)}
        onClearAssignments={() => handleCharacterReplaceConfirm(true)}
        onCancel={() => setPendingCharacterUpdate(null)}
      />

      <CharacterReplacementDialog
        open={!!pendingDragOperation}
        onOpenChange={(open) => !open && setPendingDragOperation(null)}
        existingAssignments={pendingDragOperation?.existingAssignments}
        affectedCharacterName={pendingDragOperation?.affectedCharacterName}
        affectedCharacterClass={pendingDragOperation?.affectedCharacterClass}
        newCharacterName={pendingDragOperation?.transferTargetName}
        newCharacterClass={pendingDragOperation?.transferTargetClass}
        isPending={clearAAAssignmentsMutation.isPending}
        onTransfer={() => handlePendingDragConfirm("transfer")}
        onClearAssignments={() => handlePendingDragConfirm("clear")}
        onCancel={() => handlePendingDragConfirm("cancel")}
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

      <PushDefaultAADialog
        open={showPushDialog}
        onOpenChange={(open) => !open && setShowPushDialog(false)}
        planId={planId}
        isPushing={pushDefaultAAMutation.isPending}
        onConfirm={() => {
          pushDefaultAAMutation.mutate(
            { raidPlanId: planId, preview: false },
            { onSuccess: () => setShowPushDialog(false) },
          );
        }}
      />
    </div>
  );
}
