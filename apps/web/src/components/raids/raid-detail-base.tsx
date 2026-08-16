"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";
import { Separator } from "~/components/ui/separator";
import { CharactersTable } from "~/components/characters/characters-table";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import Link from "next/link";
import { Edit, ExternalLinkIcon, Link2, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import React, { useState } from "react";
import UserAvatar from "~/components/ui/user-avatar";
import { CharacterSummaryGrid } from "~/components/characters/character-summary-grid";
import { summarizeSignupCounts } from "~/lib/raid-signup-status";
import { RaidManagerOnlyIcon } from "~/components/ui/raid-manager-only-icon";

const RAID_DETAIL_TABS = ["overview", "signups", "attendance"] as const;
type RaidDetailTab = (typeof RAID_DETAIL_TABS)[number];

export function RaidDetailBase({
  raidData,
  showEditButton,
  canViewSignupLink,
}: {
  raidData: Raid;
  showEditButton?: boolean;
  canViewSignupLink?: boolean;
  isPreview?: boolean;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<RaidDetailTab>("overview");
  const utils = api.useUtils();
  const router = useRouter();

  const { data: raidParticipants, isLoading: isLoadingParticipants } =
    api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(raidData.raidLogIds ?? [], {
      enabled: !!raidData,
    });

  const { data: signupLink } = api.raidSignupLink.forRaid.useQuery(
    { raidId: raidData.raidId ?? -1 },
    { enabled: canViewSignupLink && !!raidData.raidId },
  );

  const refreshRaidLogMutation = api.raidLog.refreshRaidLogByRaidLogId.useMutation({
    onSuccess: async () => {
      // raidData is fetched server-side (RSC prop), so invalidating the client
      // query cache alone won't update what's on screen — force a server refetch.
      await utils.raidLog.getUniqueParticipantsFromMultipleLogs.invalidate();
      router.refresh();
    },
  });

  // isRefreshing tracks the whole batch, not any individual log's mutation — reset once
  // in `finally` after every log settles, not per-mutation onSuccess/onError, or the
  // first log to finish would re-enable the button while others are still in flight.
  const handleRefreshAllLogs = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled(
        (raidData.raidLogIds ?? []).map((raidLogId) =>
          refreshRaidLogMutation.mutateAsync(raidLogId),
        ),
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const curPath = usePathname();

  return (
    <div className="px-3">
      <div className="flex gap-2 pb-0">
        <div className="grow-0 text-xl font-bold md:text-3xl">
          <div>{raidData.name}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-nowrap text-sm font-normal text-muted-foreground">
            <span>
              {new Date(raidData.date).toLocaleDateString("en-US", {
                timeZone: "UTC",
                month: "long",
                day: "numeric",
                weekday: "short",
                year: "numeric",
              })}
            </span>
            {canViewSignupLink && signupLink?.snapshot ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5">
                      <Link2 className="h-3 w-3" />
                      {(() => {
                        const { confirmed, bench } = summarizeSignupCounts(
                          signupLink.snapshot.signups,
                        );
                        return `${confirmed}(+${bench}) signups`;
                      })()}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="bg-secondary text-muted-foreground">
                    <p>Raid Helper: {signupLink.snapshot.title ?? signupLink.raidHelperEventId}</p>
                    <p className="text-xs">
                      {signupLink.source === "manual" ? "Manually linked" : "Auto-linked"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
        <div className="grow" />
        <div className="grow-0 text-right text-muted-foreground">
          <div className="whitespace-nowrap text-sm">
            <RaidAttendenceWeightBadge
              attendanceWeight={raidData.attendanceWeight}
              variant="prose"
            />
          </div>
          <div className="mt-1.5 flex justify-end">
            <ZoneBadge zoneName={raidData.zone} />
          </div>
        </div>
        {showEditButton && (
          <div className="grow-0 align-text-top">
            <Link href={curPath + "/edit"}>
              <Button className="py-5">
                <Edit />
                Edit
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="panel-surface mt-3 grid grid-cols-[auto_1fr_auto] items-start gap-6 divide-x divide-border/60 rounded-2xl border border-border/70 px-5 py-3.5">
        {/* WCL Logs */}
        <div className="min-w-0">
          {showEditButton ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleRefreshAllLogs}
                    disabled={isRefreshing}
                    className="flex items-center gap-1 font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    WCL Logs
                    <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-secondary text-muted-foreground">
                  <p>Refresh logs from WarcraftLogs</p>
                  <p className="text-xs">Updates kills and attendees</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
              WCL Logs
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 overflow-x-hidden">
            {(raidData.raidLogIds ?? []).map((raidLogId) => {
              const reportUrl = GenerateWCLReportUrl(raidLogId);
              return (
                <Link
                  key={raidLogId}
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground transition-all duration-100 hover:text-primary hover:underline"
                >
                  {raidLogId}
                  <ExternalLinkIcon className="ml-1 inline-block align-text-top" size={15} />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Kills */}
        <div className="min-w-0">
          <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
            Kills {raidData.kills ? `(${raidData.kills.length})` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 overflow-x-hidden text-nowrap">
            {(raidData.kills ?? []).map((killName, i) => {
              return (
                <div
                  key={`kill_${i}`}
                  className="grow-0 rounded bg-secondary px-2 py-1 text-xs text-muted-foreground"
                >
                  {killName}
                </div>
              );
            })}
          </div>
        </div>

        {/* Creator Info */}
        <div className="flex flex-col items-end">
          <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
            Created By
          </div>
          <div className="mt-1">
            <UserAvatar
              name={raidData.creator?.name ?? ""}
              image={raidData.creator?.image ?? ""}
              tooltipSide="left"
              showLabel={false}
            />
          </div>
        </div>
      </div>

      <Tabs
        className="mt-4"
        value={canViewSignupLink ? activeTab : "overview"}
        onValueChange={(v) => {
          if ((RAID_DETAIL_TABS as readonly string[]).includes(v)) {
            setActiveTab(v as RaidDetailTab);
          }
        }}
      >
        {canViewSignupLink && (
          <TabsList>
            <TabsTrigger value="overview">Attendance</TabsTrigger>
            <TabsTrigger value="signups" className="gap-1.5">
              <RaidManagerOnlyIcon />
              Signup Timeline
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5">
              <RaidManagerOnlyIcon />
              Signups ↔ Attendees
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="overview" className="mt-3">
          <div className="flex flex-wrap gap-2 py-1 xl:flex-nowrap">
            <div className="w-full xl:w-1/2">
              <div className="rounded-xl border bg-card p-3 text-card-foreground shadow-sm">
                <div className="text-xl">Attendees from logs:</div>
                <div className="my-1 flex justify-center">
                  <CharacterSummaryGrid
                    characters={raidParticipants ?? {}}
                    numRows={Object.keys(raidParticipants ?? []).length > 25 ? 3 : 2}
                  />
                </div>

                <CharactersTable
                  characters={raidParticipants}
                  isLoading={isLoadingParticipants}
                  showRaidColumns={false}
                />
                <div className="text-center text-sm text-muted-foreground">
                  List of characters appearing in WCL logs. <br />
                  Alts are mapped to primary characters when calc&apos;ing attendance.
                </div>
              </div>
            </div>
            <div className="w-full xl:w-1/2">
              <div className="rounded-xl border bg-card p-3 text-card-foreground shadow-sm">
                <div className="text-xl">Bench:</div>
                <CharactersTable characters={raidData.bench} showRaidColumns={false} />
                <Separator className="m-auto my-3" />
                <div className="text-center text-sm text-muted-foreground">
                  Characters available for raid but not appearing in logs (e.g. raid was full).
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {canViewSignupLink && (
          <>
            <TabsContent value="signups" className="mt-3">
              <p className="py-8 text-center text-sm text-muted-foreground">
                Signup timeline coming soon.
              </p>
            </TabsContent>
            <TabsContent value="attendance" className="mt-3">
              <p className="py-8 text-center text-sm text-muted-foreground">
                Signups ↔ Attendees comparison coming soon.
              </p>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
