"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { DndContext } from "@dnd-kit/core";
import { formatRaidDate } from "~/utils/date-formatting";
import { Info, Edit } from "lucide-react";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { api } from "~/trpc/react";
import { RaidPlanGroupsGrid } from "./raid-plan-groups-grid";
import { AAPanel } from "./aa-panel";
import { RaidPlanDetailSkeleton } from "./skeletons";
import { CUSTOM_ZONE_ID, RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { INSTANCE_TO_ZONE, CUSTOM_ZONE_DISPLAY_NAME } from "~/lib/raid-zones";
import { EncounterSidebar } from "./encounter-sidebar";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { buildEncounterCharacters, type RaidPlanCharacter } from "./types";
import { getGroupCount } from "./constants";

import { signIn } from "next-auth/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { CharacterSelector } from "~/components/characters/character-selector";

const ZONE_BADGE_CLASSES: Record<string, string> = {
  naxxramas: "bg-[hsl(var(--chart-2)/0.15)] border-chart-2 text-chart-2",
  aq40: "bg-[hsl(var(--chart-4)/0.15)] border-chart-4 text-chart-4",
  bwl: "bg-[hsl(var(--chart-5)/0.15)] border-chart-5 text-chart-5",
  mc: "bg-[hsl(var(--chart-3)/0.15)] border-chart-3 text-chart-3",
};

interface RaidPlanPublicViewProps {
  planId: string;
  initialBreadcrumbData?: { [key: string]: string };
  isLoggedIn: boolean;
  isRaidManager?: boolean;
}

export function RaidPlanPublicView({
  planId,
  initialBreadcrumbData,
  isLoggedIn,
  isRaidManager = false,
}: RaidPlanPublicViewProps) {
  const [activeTab, setActiveTab] = useState("default");
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const utils = api.useUtils();

  const {
    data: plan,
    isLoading: isPlanLoading,
    error,
  } = api.raidPlan.getPublicById.useQuery({
    planId,
  });

  const { data: userProfile } = api.profile.getMyProfile.useQuery(undefined, {
    enabled: isLoggedIn,
  });

  const saveProfileMutation = api.profile.saveMyProfile.useMutation({
    onSuccess: async () => {
      await utils.profile.getMyProfile.invalidate();
    },
    onError: (error) => {
      console.error(error);
    },
  });

  const userCharacterIds = useMemo(
    () => userProfile?.userCharacterIds ?? [],
    [userProfile?.userCharacterIds],
  );

  // Identify encounters where the current viewer has an AA assignment
  const assignmentLabelsMap = useMemo(() => {
    if (
      !isLoggedIn ||
      !userCharacterIds.length ||
      !plan?.characters.length ||
      !plan?.aaSlotAssignments
    ) {
      return new Map<string, string[]>();
    }

    // Find the planCharacterIds for the logged-in user's characters
    const viewerPlanCharacterIds = new Set(
      plan.characters
        .filter(
          (char) =>
            char.characterId !== null &&
            userCharacterIds.includes(char.characterId),
        )
        .map((char) => char.id),
    );

    if (viewerPlanCharacterIds.size === 0) {
      return new Map<string, string[]>();
    }

    // Find assignment names (and "default") where these characters have AA assignments
    const labelsMap = new Map<string, string[]>();
    for (const assignment of plan.aaSlotAssignments) {
      if (viewerPlanCharacterIds.has(assignment.planCharacterId)) {
        const key = assignment.encounterId ?? "default";
        const labels = labelsMap.get(key) ?? [];
        if (!labels.includes(assignment.slotName)) {
          labels.push(assignment.slotName);
        }
        labelsMap.set(key, labels);
      }
    }

    return labelsMap;
  }, [isLoggedIn, userCharacterIds, plan?.characters, plan?.aaSlotAssignments]);

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

  if (isPlanLoading) {
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
    <div className="relative space-y-6">
      <div>
        {/* Read-only Header */}
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-default items-center gap-2">
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                      <Badge
                        variant="secondary"
                        className="pointer-events-none px-2 py-0.5 text-muted-foreground"
                      >
                        Plan
                      </Badge>
                      {plan.name}
                    </h1>
                    <Badge
                      variant="secondary"
                      className={`pointer-events-none hidden px-2 py-0.5 lg:inline-flex ${ZONE_BADGE_CLASSES[plan.zoneId] ?? "text-muted-foreground"}`}
                    >
                      {zoneDisplayName}
                    </Badge>
                  </div>
                </TooltipTrigger>
                {(plan.startAt ?? plan.event) && (
                  <TooltipContent
                    side="top"
                    className="dark border-none bg-secondary text-muted-foreground"
                  >
                    {plan.startAt ? (
                      <p>{formatRaidDate(plan.startAt)}</p>
                    ) : plan.event ? (
                      <a
                        href={`/raids/${plan.event.raidId}`}
                        className="hover:underline"
                      >
                        Event: {plan.event.name} ({plan.event.date})
                      </a>
                    ) : null}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {isRaidManager && (
              <div className="grow-0 align-text-top">
                <Button className="py-5" asChild>
                  <a href={`/raid-manager/raid-planner/${planId}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        <Separator className="my-2" />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mt-2 grid gap-6 lg:grid-cols-[165px_minmax(0,_1fr)]">
            {/* Sidebar column */}
            <EncounterSidebar
              encounterGroups={plan.encounterGroups}
              encounters={plan.encounters}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              assignmentLabelsMap={assignmentLabelsMap}
            />

            {/* Content column */}
            <div>
              {/* Banners */}
              {!isLoggedIn && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
                  <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() =>
                        signIn("discord", {
                          redirectTo: window.location.pathname + "?signin=1",
                        })
                      }
                      size="sm"
                      className="h-7 gap-2 bg-[#5865F2] px-2 text-xs text-white hover:bg-[#8891f2]"
                    >
                      <Image
                        src="/img/discord-mark-white.svg"
                        alt="Discord"
                        height={14}
                        width={14}
                      />
                      Sign in with Discord
                    </Button>
                    <span>
                      and select your primary character to see your assignments.
                    </span>
                  </div>
                </div>
              )}

              {isLoggedIn && userProfile && !userProfile.characterId && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
                  <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <CharacterSelector
                      onSelectAction={(char) => {
                        saveProfileMutation.mutate({
                          name: userProfile.name ?? "Unknown",
                          characterId: char.characterId,
                        });
                      }}
                      characterSet="primary"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        Select primary character
                      </Button>
                    </CharacterSelector>
                    <span>to highlight your assignments.</span>
                    <span className="text-blue-700 dark:text-blue-300">
                      (Alts will be highlighted, too.)
                    </span>
                  </div>
                </div>
              )}

              {/* Two-column layout for tab content - wrapped in bare DndContext */}
              <DndContext>
                <p className="mb-2 text-lg font-semibold">
                  {activeTab === "default"
                    ? "Default/Trash"
                    : (plan.encounters.find((e) => e.id === activeTab)
                        ?.encounterName ?? "Encounter")}
                </p>
                <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
                  {/* Groups column (order 2 on mobile, 1 on desktop) */}
                  <div className="order-2 lg:order-1">
                    {/* Default Tab */}
                    <TabsContent value="default" className="mt-0 space-y-3">
                      <RaidPlanGroupsGrid
                        characters={plan.characters as RaidPlanCharacter[]}
                        groupCount={groupCount}
                        editable={false}
                        showEditControls={false}
                        hideBench
                        skipDndContext
                        userCharacterIds={userCharacterIds}
                      />
                    </TabsContent>

                    {/* Encounter Tabs */}
                    {plan.encounters.map((encounter) => (
                      <TabsContent
                        key={encounter.id}
                        value={encounter.id}
                        className="mt-0 space-y-3"
                      >
                        {encounter.useDefaultGroups ? (
                          <RaidPlanGroupsGrid
                            characters={plan.characters as RaidPlanCharacter[]}
                            groupCount={groupCount}
                            locked
                            hideBench
                            skipDndContext
                            userCharacterIds={userCharacterIds}
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
                            userCharacterIds={userCharacterIds}
                          />
                        )}
                      </TabsContent>
                    ))}
                  </div>

                  {/* AA Column (order 1 on mobile, 2 on desktop) */}
                  <div className="order-1 lg:order-2 lg:border-l lg:pl-6">
                    {/* Default Tab AA */}
                    <TabsContent value="default" className="mt-0 space-y-3">
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
                          userCharacterIds={userCharacterIds}
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
                            userCharacterIds={userCharacterIds}
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
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
