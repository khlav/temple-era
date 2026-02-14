"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { DndContext } from "@dnd-kit/core";
import { formatRaidDate } from "~/utils/date-formatting";
import { ExternalLink, Info } from "lucide-react";
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

import { signIn } from "next-auth/react";
import { Button } from "~/components/ui/button";
import { CharacterSelector } from "~/components/characters/character-selector";

interface RaidPlanPublicViewProps {
  planId: string;
  initialBreadcrumbData?: { [key: string]: string };
  isLoggedIn: boolean;
}

export function RaidPlanPublicView({
  planId,
  initialBreadcrumbData,
  isLoggedIn,
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

  const userCharacterIds = userProfile?.userCharacterIds ?? [];

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
            <h1 className="text-2xl font-bold tracking-tight">
              Raid Plan: {plan.name}
            </h1>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Zone: {zoneDisplayName}</span>
            {plan.startAt ? (
              <>
                <span>|</span>
                <span>{formatRaidDate(plan.startAt)}</span>
              </>
            ) : (
              plan.event && (
                <>
                  <span>|</span>
                  <a
                    href={`/raids/${plan.event.raidId}`}
                    className="hover:text-foreground hover:underline"
                  >
                    Event: {plan.event.name} ({plan.event.date})
                  </a>
                </>
              )
            )}
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
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              {/* Left column: Group planning (read-only) */}
              <div>
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

              {/* Right column: AA Template (read-only) */}
              <div className="border-l pl-6">
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
        </Tabs>
      </div>
    </div>
  );
}
