"use client";

import React from "react";
import { Armchair } from "lucide-react";
import { api } from "~/trpc/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Skeleton } from "~/components/ui/skeleton";

// Format date as mm/dd
function formatDateMMDD(dateString: string): string {
  const date = new Date(dateString);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}`;
}

// Map zones to chart colors (using Tailwind chart color classes)
const ZONE_COLORS = {
  naxxramas: "bg-chart-2", // Teal/cyan for green
  aq40: "bg-chart-4", // Purple in dark mode
  bwl: "bg-chart-5", // Pink/red in dark mode
  mc: "bg-chart-3", // Orange in dark mode (close to yellow)
} as const;

// Map zones to text colors for icons
const ZONE_TEXT_COLORS = {
  naxxramas: "text-chart-2",
  aq40: "text-chart-4",
  bwl: "text-chart-5",
  mc: "text-chart-3",
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

interface AttendanceHeatmapGridProps {
  characterId: number;
  showCreditsRow?: boolean;
  showSubtitle?: boolean;
  showMaxCreditsHelper?: boolean;
}

export function AttendanceHeatmapGrid({
  characterId,
  showCreditsRow = true,
  showSubtitle = true,
  showMaxCreditsHelper = true,
}: AttendanceHeatmapGridProps) {
  const { data: heatmapData, isLoading: isLoadingHeatmap } =
    api.character.getPersonalAttendanceHeatmap.useQuery(
      characterId ? { characterId } : undefined,
      { enabled: !!characterId },
    );
  const { data: thisWeekData, isLoading: isLoadingThisWeek } =
    api.character.getPersonalAttendanceThisWeek.useQuery(
      characterId ? { characterId } : undefined,
      { enabled: !!characterId },
    );

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
    const isMC = zone === "mc";

    // Handle empty MC - show outlined triangle with rounded corner
    if (isMC && (!weekData || !weekData.attended)) {
      const radius = 2; // Corner radius (matches filled triangle)
      return (
        <div className="relative h-4 w-4">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className="absolute inset-0"
          >
            <path
              d={`M ${radius} 0 Q 0 0 0 ${radius} L 0 16 L 16 0 Z`}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="1"
            />
          </svg>
        </div>
      );
    }

    // Handle empty non-MC - show square outline
    if (!weekData || !weekData.attended) {
      return (
        <div className="h-4 w-4 rounded border border-muted bg-background" />
      );
    }

    const zoneColor = ZONE_COLORS[zone];
    const zoneTextColor = ZONE_TEXT_COLORS[zone];
    const isGrayed = weekData.isGrayed ?? false;

    // Check if any raid was attended (prioritize attendee over bench)
    const hasAttendee = weekData.raids.some(
      (raid) => raid.status === "attendee",
    );
    // Only show bench icon if all raids were bench (no attendee raids)
    const allBench = !hasAttendee && weekData.raids.length > 0;

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

    // If all raids were bench, show bench icon
    if (allBench) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex h-4 w-4 items-center justify-center ${
                isGrayed ? "opacity-50" : ""
              }`}
            >
              <Armchair
                size={16}
                className={`${zoneTextColor} ${isGrayed ? "grayscale" : ""}`}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-secondary text-muted-foreground">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      );
    }

    if (isMC) {
      // Half-square with diagonal cut from bottom-left to top-right, filled in top-left
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

  if (isLoadingHeatmap || isLoadingThisWeek) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!heatmapData?.weeks || heatmapData.weeks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No attendance data available
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="inline-block">
        {showSubtitle && (
          <div className="mb-2 text-center text-sm text-muted-foreground">
            Last 6 lockout weeks
          </div>
        )}
        <table className="table-fixed border-collapse">
          <colgroup>
            <col className="w-auto" />
            {heatmapData.weeks.map((week, idx) => (
              <col key={`col-${week.weekStart}-${idx}`} className="w-12" />
            ))}
            <col className="w-2" />
            <col className="w-12" />
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
              <th className="px-1"></th>
              <th className="whitespace-nowrap px-1 text-center text-xs font-medium text-muted-foreground">
                This Week
              </th>
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
                <td className="px-1 py-1 text-center align-middle">
                  <div className="h-4 border-l-2 border-dotted border-muted-foreground" />
                </td>
                <td className="px-1 py-1 text-center align-middle">
                  <div className="flex items-center justify-center">
                    {renderHeatmapCell(zone, thisWeekData?.zones[zone])}
                  </div>
                </td>
              </tr>
            ))}
            {showCreditsRow && (
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
                <td className="px-1 py-1"></td>
                <td className="px-1 py-1"></td>
              </tr>
            )}
            {showMaxCreditsHelper && (
              <tr>
                <td
                  colSpan={heatmapData.weeks.length + 1}
                  className="py-1 text-center text-xs italic text-muted-foreground"
                >
                  Max +3 credits/week, +1 per unique zone (+0.5 for MC)
                </td>
                <td colSpan={2} className="px-1 py-1"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
