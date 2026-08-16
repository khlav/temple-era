"use client";

import type { Raid, RaidParticipant } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import Link from "next/link";
import { Edit, Link2, RefreshCw } from "lucide-react";
import { WCLIcon } from "~/components/ui/wcl-icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import React, { useMemo, useState } from "react";
import UserAvatar from "~/components/ui/user-avatar";
import { CharacterLink } from "~/components/ui/character-link";
import { summarizeSignupCounts } from "~/lib/raid-signup-status";
import { RaidManagerOnlyIcon } from "~/components/ui/raid-manager-only-icon";
import { AA_CLASS_COLORS } from "~/lib/aa-formatting";
import { ClassIcon } from "~/components/ui/class-icon";
import { cn } from "~/lib/utils";

const RAID_DETAIL_TABS = ["overview", "signups", "attendance"] as const;
type RaidDetailTab = (typeof RAID_DETAIL_TABS)[number];

const PARTICIPANT_GRID_COLS = "grid-cols-[minmax(0,1fr)_132px_104px]";

const PILL_TAB_LIST_CLASSNAME =
  "h-auto gap-1.5 rounded-full border border-border/70 bg-transparent p-1";
const PILL_TAB_TRIGGER_CLASSNAME =
  "rounded-full px-3.5 py-1.5 text-[13px] font-medium data-[state=active]:bg-primary/14 data-[state=active]:text-primary data-[state=active]:shadow-none";

function ParticipantStatusCell({ status }: { status: "attendee" | "bench" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        status === "attendee" ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-[7px] w-[7px] shrink-0 rounded-full",
          status === "attendee" ? "bg-primary" : "bg-muted-foreground",
        )}
      />
      {status === "attendee" ? "attended" : "bench"}
    </span>
  );
}

export function SidebarCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-surface rounded-2xl border border-border/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </div>
        {action}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

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

  // One combined Character / Credited to / Status table, per the redesign hi-fi spec —
  // replaces the old two-card attendees/bench split (CharactersTable ×2).
  const participants = useMemo(() => {
    const attendees = Object.values(raidParticipants ?? {}).map((c) => ({
      ...c,
      status: "attendee" as const,
    }));
    const bench = Object.values(raidData.bench ?? {}).map((c) => ({
      ...c,
      status: "bench" as const,
    }));
    return [...attendees, ...bench].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [raidParticipants, raidData.bench]);

  const attendeeCount = Object.keys(raidParticipants ?? {}).length;
  const benchCount = Object.keys(raidData.bench ?? {}).length;

  // Class breakdown for the Composition card — grouped from attendees only (the bench
  // isn't "in" the raid), sorted by headcount desc to match the hi-fi mock.
  const composition = useMemo(() => {
    const groups = new Map<string, RaidParticipant[]>();
    for (const c of Object.values(raidParticipants ?? {})) {
      const key = c.class;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .map(([characterClass, members]) => ({ characterClass, count: members.length }))
      .sort((a, b) => b.count - a.count);
  }, [raidParticipants]);

  return (
    <div className="px-3">
      <div className="text-sm text-muted-foreground">
        <Link href="/raids" className="transition-colors hover:text-primary">
          Raids
        </Link>{" "}
        › {raidData.name}
      </div>

      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {raidData.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
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
            <RaidAttendenceWeightBadge
              attendanceWeight={raidData.attendanceWeight}
              variant="prose"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <ZoneBadge zoneName={raidData.zone} />
          {showEditButton && (
            <Link href={curPath + "/edit"}>
              <Button>
                <Edit />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs
        value={canViewSignupLink ? activeTab : "overview"}
        onValueChange={(v) => {
          if ((RAID_DETAIL_TABS as readonly string[]).includes(v)) {
            setActiveTab(v as RaidDetailTab);
          }
        }}
      >
        {canViewSignupLink && (
          <TabsList className={PILL_TAB_LIST_CLASSNAME}>
            <TabsTrigger value="overview" className={PILL_TAB_TRIGGER_CLASSNAME}>
              Attendance
            </TabsTrigger>
            <TabsTrigger value="signups" className={cn(PILL_TAB_TRIGGER_CLASSNAME, "gap-1.5")}>
              <RaidManagerOnlyIcon />
              Signup Timeline
            </TabsTrigger>
            <TabsTrigger value="attendance" className={cn(PILL_TAB_TRIGGER_CLASSNAME, "gap-1.5")}>
              <RaidManagerOnlyIcon />
              Signups ↔ Attendees
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="overview" className="mt-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="panel-surface overflow-hidden rounded-2xl border border-border/70">
                <div className="flex items-baseline justify-between gap-3 border-b border-border/70 px-4 py-3">
                  <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                    Attendance · {attendeeCount} attendees, {benchCount} benched
                  </div>
                  <div className="text-xs text-muted-foreground">from WCL logs</div>
                </div>
                <div
                  className={cn(
                    "grid items-center gap-3 border-b border-border/50 px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-muted-foreground",
                    PARTICIPANT_GRID_COLS,
                  )}
                >
                  <div>Character</div>
                  <div>Credited to</div>
                  <div>Status</div>
                </div>
                <div className="max-h-[min(46svh,32rem)] overflow-y-auto">
                  {isLoadingParticipants ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Loading…
                    </div>
                  ) : participants.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No participants found.
                    </div>
                  ) : (
                    participants.map((p) => (
                      <div
                        key={p.characterId}
                        className={cn(
                          "grid items-center gap-3 border-b border-border/45 px-4 py-2.5 text-sm last:border-b-0",
                          PARTICIPANT_GRID_COLS,
                        )}
                      >
                        <div className="min-w-0">
                          <CharacterLink
                            characterId={p.characterId}
                            characterName={p.name}
                            characterClass={p.class}
                          />
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {p.primaryCharacterName ?? "—"}
                        </div>
                        <ParticipantStatusCell status={p.status} />
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-3 text-center text-sm text-muted-foreground">
                List of characters appearing in WCL logs, plus bench (available but not logged).
                <br />
                Alts are mapped to primary characters when calc&apos;ing attendance.
              </div>
            </div>

            <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[264px]">
              <SidebarCard title="Composition" action={<span>{attendeeCount}</span>}>
                {composition.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No data yet.</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {composition.map((g) => (
                      <div key={g.characterClass} className="flex items-center gap-2">
                        <ClassIcon
                          characterClass={g.characterClass.toLowerCase()}
                          px={18}
                          className="shrink-0 rounded-sm"
                        />
                        <span className="font-display w-4 shrink-0 text-right text-xs font-semibold">
                          {g.count}
                        </span>
                        <span className="flex flex-wrap items-center gap-[3px]">
                          {Array.from({ length: Math.min(g.count, 10) }).map((_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-[11px] w-[11px] shrink-0 rounded-[2px]",
                                i === 4 && "mr-[3px]",
                              )}
                              style={{
                                backgroundColor:
                                  AA_CLASS_COLORS[g.characterClass.toLowerCase()] ?? "#8a8a8a",
                              }}
                            />
                          ))}
                          {g.count > 10 ? (
                            <span
                              className="font-display ml-0.5 shrink-0 text-[10px] font-bold leading-none"
                              style={{
                                color: AA_CLASS_COLORS[g.characterClass.toLowerCase()] ?? "#8a8a8a",
                              }}
                            >
                              +{g.count - 10}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SidebarCard>

              <SidebarCard
                title="WCL logs"
                action={
                  showEditButton ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleRefreshAllLogs}
                            disabled={isRefreshing}
                            className="flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
                            />
                            Refresh
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-secondary text-muted-foreground">
                          <p>Refresh logs from WarcraftLogs</p>
                          <p className="text-xs">Updates kills and attendees</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null
                }
              >
                <div className="flex flex-col gap-1.5">
                  {(raidData.raidLogIds ?? []).map((raidLogId) => {
                    const reportUrl = GenerateWCLReportUrl(raidLogId);
                    return (
                      <Link
                        key={raidLogId}
                        href={reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {raidLogId}
                        <WCLIcon />
                      </Link>
                    );
                  })}
                  {(raidData.raidLogIds ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No logs linked.</div>
                  ) : null}
                </div>
              </SidebarCard>

              <SidebarCard title={`Kills${raidData.kills ? ` · ${raidData.kills.length}` : ""}`}>
                <div className="flex flex-wrap gap-1.5">
                  {(raidData.kills ?? []).map((killName, i) => (
                    <span
                      key={`kill_${i}`}
                      className="rounded-lg bg-secondary px-2 py-1 text-xs text-muted-foreground"
                    >
                      {killName}
                    </span>
                  ))}
                </div>
              </SidebarCard>

              <SidebarCard title="Created by">
                <UserAvatar
                  name={raidData.creator?.name ?? ""}
                  image={raidData.creator?.image ?? ""}
                  tooltipSide="left"
                  showLabel
                />
              </SidebarCard>
            </aside>
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
