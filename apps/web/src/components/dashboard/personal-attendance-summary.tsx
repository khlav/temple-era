"use client";

import React from "react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import type { Session } from "next-auth";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Skeleton } from "~/components/ui/skeleton";
import { ClassIcon } from "~/components/ui/class-icon";

// Format date as mm/dd
function formatDateMMDD(dateString: string): string {
  const date = new Date(dateString);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}`;
}

// Map zones to chart colors (using Tailwind chart color classes)
// chart-1: blue (dark), chart-2: teal/cyan, chart-3: orange, chart-4: purple (dark), chart-5: pink/red
const ZONE_COLORS = {
  naxxramas: "bg-chart-2", // Teal/cyan for green
  aq40: "bg-chart-4", // Purple in dark mode
  bwl: "bg-chart-5", // Pink/red in dark mode
  mc: "bg-chart-3", // Orange in dark mode (close to yellow)
} as const;

// For SVG fill, use CSS variable format
const ZONE_COLORS_SVG = {
  naxxramas: "hsl(var(--chart-2))",
  aq40: "hsl(var(--chart-4))",
  bwl: "hsl(var(--chart-5))",
  mc: "hsl(var(--chart-3))",
} as const;

const ZONE_LABELS = {
  naxxramas: "Naxx",
  aq40: "AQ40",
  bwl: "BWL",
  mc: "MC",
} as const;

export function PersonalAttendanceSummary({
  currentUserSession,
  currentUserCharacterId,
}: {
  currentUserSession?: Session;
  currentUserCharacterId?: number;
}) {
  const { data: attendanceData } =
    api.dashboard.getPrimaryRaidAttendanceL6LockoutWk.useQuery();
  const { data: heatmapData, isLoading: isLoadingHeatmap } =
    api.dashboard.getPersonalAttendanceHeatmap.useQuery();
  const { data: characterData } = api.character.getCharacterById.useQuery(
    currentUserCharacterId ?? -1,
    { enabled: !!currentUserCharacterId },
  );

  // Get character name and class for title
  const getTitle = () => {
    if (!currentUserSession?.user) {
      return { characterName: null, characterClass: undefined };
    }
    if (!currentUserCharacterId) {
      return { characterName: null, characterClass: undefined };
    }
    const userAttendance = attendanceData?.find(
      (raider) => raider.characterId === currentUserCharacterId,
    );
    const characterName = userAttendance?.name;
    const characterClass = characterData?.class;

    if (!characterName) {
      return { characterName: null, characterClass: undefined };
    }

    return { characterName, characterClass };
  };

  const titleData = getTitle();
  const titleClass = titleData.characterClass;

  // No session state
  if (!currentUserSession?.user) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {titleClass && <ClassIcon characterClass={titleClass} px={20} />}
            {titleData.characterName ? (
              <span>
                <span className="font-bold">{titleData.characterName}</span> —
                Raid Attendance, Last 6 lockouts
              </span>
            ) : (
              <span>Raid Attendance, Last 6 lockouts</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-center">
              <div className="mb-2 text-sm">
                Log in with Discord and select your primary character to view
                your attendance
              </div>
              <div className="flex justify-center">
                <Button
                  onClick={() =>
                    signIn("discord", { redirectTo: "/?signin=1" })
                  }
                  className="flex items-center justify-center gap-2 bg-[#5865F2] transition-all duration-200 ease-in-out hover:bg-[#8891f2]"
                >
                  <Image
                    src="/img/discord-mark-white.svg"
                    alt="Discord"
                    height={24}
                    width={24}
                  />
                  <span className="text-secondary-foreground">
                    Sign in with Discord
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Session but no character state
  if (!currentUserCharacterId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {titleClass && <ClassIcon characterClass={titleClass} px={20} />}
            {titleData.characterName ? (
              <span>
                <span className="font-bold">{titleData.characterName}</span> —
                Raid Attendance, Last 6 lockouts
              </span>
            ) : (
              <span>Raid Attendance, Last 6 lockouts</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-center">
              <div className="mb-2 text-sm">
                Select your primary character to view your attendance
              </div>
              <Button asChild>
                <Link href="/profile">Go to Profile</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find user's attendance data
  const userAttendance = attendanceData?.find(
    (raider) => raider.characterId === currentUserCharacterId,
  );

  const attendancePct = userAttendance?.weightedAttendancePct ?? 0;
  const attendancePercent = Math.round((attendancePct ?? 0) * 100);
  const isAboveThreshold = attendancePercent >= 50;
  // Match colors from attendance-report.tsx: chart-2 (yellow) for >=50%, light gray for <50%
  // Use a visible gray that contrasts with the bg-muted background
  const progressColor = isAboveThreshold ? "bg-chart-2" : "bg-gray-400";

  // Render heatmap grid
  const renderHeatmapCell = (
    zone: "naxxramas" | "aq40" | "bwl" | "mc",
    weekData:
      | {
          attended: boolean;
          attendanceWeight: number;
          raids: Array<{
            name: string;
            status: "attendee" | "bench";
            characterNames?: string[];
          }>;
          isGrayed?: boolean;
        }
      | undefined,
  ) => {
    if (!weekData || !weekData.attended) {
      return (
        <div className="h-4 w-4 rounded border border-muted bg-background" />
      );
    }

    const zoneColor = ZONE_COLORS[zone];
    const isMC = zone === "mc";
    const isGrayed = weekData.isGrayed ?? false;

    const tooltipContent = (
      <div className="text-xs">
        {weekData.raids.map((raid, idx) => {
          const characterNames = raid.characterNames?.join(", ") ?? "";
          const benchSuffix = raid.status === "bench" ? " (bench)" : "";
          return (
            <div key={idx}>
              {raid.name} - {characterNames}
              {benchSuffix}
            </div>
          );
        })}
      </div>
    );

    if (isMC) {
      // Half-square with diagonal cut from bottom-left to top-right, filled in top-left
      // Triangle: top-left to top-right to bottom-left, with rounded top-left corner
      const radius = 2; // Corner radius
      const fillColor = ZONE_COLORS_SVG[zone];
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`relative h-4 w-4 ${isGrayed ? "opacity-50" : ""}`}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                className="absolute inset-0"
              >
                <path
                  d={`M ${radius} 0 Q 0 0 0 ${radius} L 0 16 L 16 0 Z`}
                  fill={fillColor}
                  style={{
                    filter: isGrayed ? "grayscale(100%)" : "none",
                  }}
                />
              </svg>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-secondary text-muted-foreground">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      );
    }

    // Full square for other zones
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`h-4 w-4 rounded ${zoneColor} ${
              isGrayed ? "opacity-50 grayscale" : ""
            }`}
          />
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1">
          {titleClass && <ClassIcon characterClass={titleClass} px={20} />}
          {titleData.characterName ? (
            <span>
              <span className="font-bold">{titleData.characterName}</span> —
              Raid Attendance, Last 6 lockouts
            </span>
          ) : (
            <span>Raid Attendance, Last 6 lockouts</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="-mt-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex cursor-help items-center gap-2">
                <span className="text-2xl font-bold leading-none">
                  {attendancePercent}%
                </span>
                <div className="relative flex-1">
                  <div className="h-4 w-full rounded-full bg-muted">
                    <div
                      className={`h-4 rounded-full ${progressColor} transition-all`}
                      style={{ width: `${attendancePercent}%` }}
                    />
                  </div>
                  {/* Optional 50% dotted line */}
                  <div
                    className="absolute top-0 h-4 border-l-2 border-dotted border-muted-foreground"
                    style={{ left: "50%" }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-secondary text-muted-foreground">
              <div className="text-xs">
                {userAttendance?.weightedAttendance ?? 0} of 18 attendance
                credits
              </div>
            </TooltipContent>
          </Tooltip>
          <div className="mt-[1px] flex justify-end text-xs text-muted-foreground">
            {isAboveThreshold ? (
              <span>
                <span className="text-chart-2">Eligible</span> for{" "}
                <Link
                  href="https://docs.google.com/spreadsheets/d/1OBcFgT1AXiPL3eW7x3yUx6EjsopPLlFMclph2OGRkXU/edit?gid=0#gid=0"
                  target="_blank"
                  className="underline hover:text-foreground"
                >
                  restricted Naxx loot
                </Link>
              </span>
            ) : (
              <span>
                <span className="text-gray-400">Not Eligible</span> for{" "}
                <Link
                  href="https://docs.google.com/spreadsheets/d/1OBcFgT1AXiPL3eW7x3yUx6EjsopPLlFMclph2OGRkXU/edit?gid=0#gid=0"
                  target="_blank"
                  className="underline hover:text-foreground"
                >
                  restricted Naxx loot
                </Link>
              </span>
            )}
          </div>
        </div>

        {/* Heatmap Grid */}
        {isLoadingHeatmap ? (
          <Skeleton className="h-32 w-full" />
        ) : heatmapData?.weeks && heatmapData.weeks.length > 0 ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="inline-block">
              <div className="mb-2 text-center text-sm text-muted-foreground">
                Last 6 lockout weeks
              </div>
              <table className="table-fixed border-collapse">
                <colgroup>
                  <col className="w-auto" />
                  {heatmapData.weeks.map((week, idx) => (
                    <col
                      key={`col-${week.weekStart}-${idx}`}
                      className="w-12"
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="pr-3 text-left text-xs font-medium text-muted-foreground">
                      Zone
                    </th>
                    {heatmapData.weeks.map((week) => (
                      <th
                        key={week.weekStart}
                        className="px-1 text-center text-xs font-medium text-muted-foreground"
                      >
                        {formatDateMMDD(week.weekStart)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["naxxramas", "aq40", "bwl", "mc"] as const).map((zone) => (
                    <tr key={zone}>
                      <td className="py-1 pr-3 text-xs font-medium">
                        {ZONE_LABELS[zone]}
                      </td>
                      {heatmapData.weeks.map((week) => (
                        <td
                          key={week.weekStart}
                          className="px-1 py-1 text-center align-middle"
                        >
                          <div className="flex items-center justify-center">
                            {renderHeatmapCell(zone, week.zones[zone])}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 pr-3 text-xs font-medium"></td>
                    {heatmapData.weeks.map((week) => {
                      // Calculate total credits for this week
                      // Naxx, AQ40, BWL = 1 credit each, MC = 0.5 credit
                      // Max is +3, so MC doesn't count if Naxx + AQ40 + BWL all attended
                      const hasNaxx = week.zones.naxxramas?.attended ?? false;
                      const hasAQ40 = week.zones.aq40?.attended ?? false;
                      const hasBWL = week.zones.bwl?.attended ?? false;
                      const hasMC = week.zones.mc?.attended ?? false;
                      const isMCGrayed = week.zones.mc?.isGrayed ?? false;

                      let totalCredits = 0;
                      if (hasNaxx) totalCredits += 1;
                      if (hasAQ40) totalCredits += 1;
                      if (hasBWL) totalCredits += 1;

                      // MC only counts if not grayed (i.e., didn't already hit max of 3)
                      if (hasMC && !isMCGrayed) totalCredits += 0.5;

                      // Cap at 3
                      totalCredits = Math.min(totalCredits, 3);

                      return (
                        <td
                          key={week.weekStart}
                          className="px-1 py-1 text-center align-middle text-xs text-muted-foreground"
                        >
                          {totalCredits > 0 ? `+${totalCredits}` : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <div className="mt-2 text-center text-xs italic text-muted-foreground">
                Max +3 credits/week, +1 per unique zone (+0.5 for MC)
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No attendance data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
