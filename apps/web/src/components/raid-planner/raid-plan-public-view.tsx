"use client";

import { useState, useEffect } from "react";
import { DndContext } from "@dnd-kit/core";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { api } from "~/trpc/react";
import { RaidPlanGroupsGrid } from "./raid-plan-groups-grid";
import { AAPanel } from "./aa-panel";
import { RaidPlanDetailSkeleton } from "./skeletons";
import { CUSTOM_ZONE_ID, RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { INSTANCE_TO_ZONE, CUSTOM_ZONE_DISPLAY_NAME } from "~/lib/raid-zones";
import { cn } from "~/lib/utils";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { buildEncounterCharacters, type RaidPlanCharacter } from "./types";
import { getGroupCount } from "./constants";

interface RaidPlanPublicViewProps {
  planId: string;
  initialBreadcrumbData?: { [key: string]: string };
}

export function RaidPlanPublicView({
  planId,
  initialBreadcrumbData,
}: RaidPlanPublicViewProps) {
  const [activeTab, setActiveTab] = useState("default");
  const { updateBreadcrumbSegment } = useBreadcrumb();

  const {
    data: plan,
    isLoading,
    error,
  } = api.raidPlan.getPublicById.useQuery({
    planId,
  });

  // Update breadcrumb to show plan name instead of UUID
  useEffect(() => {
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    } else if (plan?.name) {
      updateBreadcrumbSegment(planId, plan.name);
    }
  }, [planId, plan?.name, initialBreadcrumbData, updateBreadcrumbSegment]);

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

  const groupCount = getGroupCount(plan.zoneId);
  const zoneName =
    RAID_ZONE_CONFIG.find((z) => z.instance === plan.zoneId)?.name ??
    plan.zoneId;

  // Get display name for zone
  const zoneDisplayName =
    plan.zoneId === CUSTOM_ZONE_ID
      ? CUSTOM_ZONE_DISPLAY_NAME
      : (INSTANCE_TO_ZONE[plan.zoneId] ?? plan.zoneId);

  return (
    <div className="space-y-6">
      {/* Read-only Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            Raid Plan: {plan.name}
          </h1>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>Zone: {zoneDisplayName}</span>
          {plan.event && (
            <>
              <span>|</span>
              <a
                href={`/raids/${plan.event.raidId}`}
                className="hover:text-foreground hover:underline"
              >
                Event: {plan.event.name} ({plan.event.date})
              </a>
            </>
          )}
          <span>|</span>
          <span>Created: {format(plan.createdAt, "MMM d, yyyy")}</span>
          <span>|</span>
          <a
            href={`https://raid-helper.dev/event/${plan.raidHelperEventId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            Raid-Helper
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tabs (no add/reorder buttons) */}
        <div className="flex items-center gap-2">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="default">Default/Trash</TabsTrigger>
            {plan.encounters.map((encounter) => (
              <TabsTrigger
                key={encounter.id}
                value={encounter.id}
                className={cn(
                  encounter.useDefaultGroups ? "italic opacity-50" : "",
                )}
              >
                {encounter.encounterName}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Two-column layout for tab content - wrapped in bare DndContext */}
        <DndContext>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Left column: Group planning (read-only) */}
            <div>
              {/* Default Tab */}
              <TabsContent value="default" className="mt-0 space-y-3">
                <div className="flex h-7 items-center" />
                <RaidPlanGroupsGrid
                  characters={plan.characters as RaidPlanCharacter[]}
                  groupCount={groupCount}
                  editable={false}
                  showEditControls={false}
                  hideBench
                  skipDndContext
                />
              </TabsContent>

              {/* Encounter Tabs */}
              {plan.encounters.map((encounter) => (
                <TabsContent
                  key={encounter.id}
                  value={encounter.id}
                  className="mt-0 space-y-3"
                >
                  <div className="flex h-7 items-center" />
                  {encounter.useDefaultGroups ? (
                    <RaidPlanGroupsGrid
                      characters={plan.characters as RaidPlanCharacter[]}
                      groupCount={groupCount}
                      locked
                      hideBench
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
                      editable={false}
                      showEditControls={false}
                      hideBench
                      skipDndContext
                    />
                  )}
                </TabsContent>
              ))}
            </div>

            {/* Right column: AA Template (read-only) */}
            <div className="border-l pl-6">
              {/* Default Tab AA */}
              <TabsContent value="default" className="mt-0 space-y-3">
                <div className="flex h-7 items-center" />
                {plan.useDefaultAA && plan.defaultAATemplate ? (
                  <AAPanel
                    template={plan.defaultAATemplate}
                    characters={plan.characters as RaidPlanCharacter[]}
                    slotAssignments={plan.aaSlotAssignments.filter(
                      (a) => a.raidPlanId === planId,
                    )}
                    contextId={planId}
                    contextLabel="Default/Trash"
                    zoneName={zoneName}
                    readOnly
                  />
                ) : (
                  <div className="rounded-lg border border-dashed p-6">
                    <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                      AA not enabled for Default/Trash
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
                  <div className="flex h-7 items-center" />
                  {encounter.useCustomAA && encounter.aaTemplate ? (
                    <AAPanel
                      template={encounter.aaTemplate}
                      characters={plan.characters as RaidPlanCharacter[]}
                      slotAssignments={plan.aaSlotAssignments.filter(
                        (a) => a.encounterId === encounter.id,
                      )}
                      contextId={encounter.id}
                      contextLabel={encounter.encounterName}
                      zoneName={zoneName}
                      readOnly
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed p-6">
                      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                        AA not enabled for this encounter
                      </div>
                    </div>
                  )}
                </TabsContent>
              ))}
            </div>
          </div>
        </DndContext>
      </Tabs>
    </div>
  );
}
