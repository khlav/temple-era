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
  compact?: boolean;
  showThisWeek?: boolean;
  weeksBack?: number;
  includeCurrentWeek?: boolean;
}

export function AttendanceHeatmapGrid({
  characterId,
  showCreditsRow = true,
  showSubtitle = true,
  showMaxCreditsHelper = true,
  compact = false,
  showThisWeek = true,
  weeksBack = 6,
  includeCurrentWeek = true,
}: AttendanceHeatmapGridProps) {
  const { data: heatmapData, isLoading: isLoadingHeatmap } =
    api.character.getWeeklyPrimaryCharacterAttendance.useQuery(
      characterId ? { characterId, weeksBack, includeCurrentWeek } : undefined,
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
    isHistorical: boolean = false,
  ) => {
    const isMC = zone === "mc";

    // Handle empty MC - show outlined triangle with rounded corner
    if (isMC && (!weekData || !weekData.attended)) {
      const radius = 2; // Corner radius (matches filled triangle)
      return (
        <div className={`relative h-4 w-4 ${isHistorical ? "opacity-30" : ""}`}>
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
        <div
          className={`h-4 w-4 rounded border border-muted bg-background ${
            isHistorical ? "opacity-30" : ""
          }`}
        />
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
      // For MC, clip the icon to show only the triangle portion (matching filled triangle)
      if (isMC) {
        // Use CSS clip-path to match the triangle shape (top-left triangle)
        // This approximates the rounded-corner triangle used for filled MC cells
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative h-4 w-4 overflow-hidden ${
                  isHistorical ? "opacity-30" : ""
                }`}
                style={{
                  clipPath: "polygon(0 0, 0 100%, 100% 0)",
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Armchair
                    size={16}
                    className={
                      isGrayed
                        ? "text-gray-700 dark:text-gray-500"
                        : zoneTextColor
                    }
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-secondary text-muted-foreground">
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        );
      }

      // For non-MC zones, show full icon
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex h-4 w-4 items-center justify-center ${
                isHistorical ? "opacity-30" : ""
              }`}
            >
              <Armchair
                size={16}
                className={isGrayed ? "text-gray-600" : zoneTextColor}
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
            <div
              className={`relative h-4 w-4 ${isHistorical ? "opacity-30" : ""}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                className="absolute inset-0"
              >
                <path
                  d={`M ${radius} 0 Q 0 0 0 ${radius} L 0 16 L 16 0 Z`}
                  fill={
                    isGrayed
                      ? "#4B5563" // gray-600
                      : fillColor
                  }
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
            className={`h-4 w-4 rounded ${
              isGrayed ? "bg-gray-600 dark:bg-gray-400" : zoneColor
            } ${isHistorical ? "opacity-30" : ""}`}
          />
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  };

  if (isLoadingHeatmap) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!heatmapData?.weeks || heatmapData.weeks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No attendance data available
      </div>
    );
  }

  // Determine which week is the current week (last week if includeCurrentWeek is true)
  const currentWeekIndex =
    includeCurrentWeek && heatmapData.weeks.length > 0
      ? heatmapData.weeks.length - 1
      : -1;

  // Calculate the first scoring week index (6 most recent complete weeks, excluding current week)
  // Scoring weeks are the 6 weeks before the current week (if current week exists)
  const firstScoringWeekIndex =
    heatmapData.weeks.length - (includeCurrentWeek ? 7 : 6);
  const hasHistoricalWeeks = firstScoringWeekIndex > 0;

  return (
    <div className={`flex flex-col items-center ${compact ? "" : "space-y-2"}`}>
      <div className="mx-auto inline-block">
        {!compact && showSubtitle && (
          <div className="mb-2 text-center text-sm text-muted-foreground">
            {includeCurrentWeek
              ? `Last ${weeksBack} lockout weeks + current week`
              : `Last ${weeksBack} lockout weeks`}
          </div>
        )}
        <div className="mx-auto w-fit">
          <table className="table-auto border-collapse md:table-fixed">
            <colgroup>
              {!compact && <col className="w-auto" />}
              {heatmapData.weeks.map((week, idx) => {
                const isCurrentWeek = idx === currentWeekIndex;
                const isFirstScoringWeek = idx === firstScoringWeekIndex;
                const showSeparatorBeforeCurrent =
                  showThisWeek && isCurrentWeek;
                const showSeparatorBeforeScoring =
                  hasHistoricalWeeks && isFirstScoringWeek;
                const isHistorical = week.isHistorical ?? false;
                return (
                  <React.Fragment key={`col-group-${week.weekStart}-${idx}`}>
                    {(showSeparatorBeforeCurrent ||
                      showSeparatorBeforeScoring) && (
                      <col
                        className={`${compact ? "w-1" : "w-2"} hidden md:table-column`}
                      />
                    )}
                    <col
                      key={`col-${week.weekStart}-${idx}`}
                      className={`${compact ? "w-4" : "w-12"} ${
                        isHistorical ? "hidden md:table-column" : ""
                      }`}
                    />
                  </React.Fragment>
                );
              })}
            </colgroup>
            {!compact && (
              <thead>
                <tr>
                  <th className="pr-3 text-left text-xs font-medium text-muted-foreground">
                    Zone
                  </th>
                  {heatmapData.weeks.map((week, idx) => {
                    const isCurrentWeek = idx === currentWeekIndex;
                    const isFirstScoringWeek = idx === firstScoringWeekIndex;
                    const showSeparatorBeforeCurrent =
                      showThisWeek && isCurrentWeek;
                    const showSeparatorBeforeScoring =
                      hasHistoricalWeeks && isFirstScoringWeek;
                    const isHistorical = week.isHistorical ?? false;
                    return (
                      <React.Fragment key={`header-${week.weekStart}-${idx}`}>
                        {(showSeparatorBeforeCurrent ||
                          showSeparatorBeforeScoring) && (
                          <th className="hidden px-1 md:table-cell"></th>
                        )}
                        <th
                          key={`th-${week.weekStart}-${idx}`}
                          className={`px-1 text-center text-xs font-medium text-muted-foreground ${
                            isHistorical ? "hidden md:table-cell" : ""
                          }`}
                        >
                          {isCurrentWeek
                            ? "This Week"
                            : formatDateMMDD(week.weekStart)}
                        </th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody>
              {(["naxxramas", "aq40", "bwl", "mc"] as const).map((zone) => (
                <tr key={zone}>
                  {!compact && (
                    <td className="py-1 pr-3 text-xs font-medium">
                      {ZONE_LABELS[zone]}
                    </td>
                  )}
                  {heatmapData.weeks.map((week, idx) => {
                    const isCurrentWeek = idx === currentWeekIndex;
                    const isFirstScoringWeek = idx === firstScoringWeekIndex;
                    const showSeparatorBeforeCurrent =
                      showThisWeek && isCurrentWeek;
                    const showSeparatorBeforeScoring =
                      hasHistoricalWeeks && isFirstScoringWeek;
                    const isHistorical = week.isHistorical ?? false;
                    return (
                      <React.Fragment key={`cell-${week.weekStart}-${idx}`}>
                        {(showSeparatorBeforeCurrent ||
                          showSeparatorBeforeScoring) && (
                          <td
                            className={`${
                              compact ? "px-0.5 py-0.5" : "px-1 py-1"
                            } hidden text-center align-middle md:table-cell`}
                          >
                            <div className="h-4 border-l-2 border-dotted border-muted-foreground" />
                          </td>
                        )}
                        <td
                          key={`td-${week.weekStart}-${idx}`}
                          className={`${
                            compact ? "px-0.5 py-0.5" : "px-1 py-1"
                          } text-center align-middle ${
                            isHistorical ? "hidden md:table-cell" : ""
                          }`}
                        >
                          <div className="flex items-center justify-center">
                            {renderHeatmapCell(
                              zone,
                              week.zones[zone],
                              isHistorical,
                            )}
                          </div>
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              {!compact && showCreditsRow && (
                <tr>
                  <td className="py-1 pr-3 text-xs font-medium"></td>
                  {heatmapData.weeks.map((week, idx) => {
                    const isCurrentWeek = idx === currentWeekIndex;
                    const isFirstScoringWeek = idx === firstScoringWeekIndex;
                    const showSeparatorBeforeCurrent =
                      showThisWeek && isCurrentWeek;
                    const showSeparatorBeforeScoring =
                      hasHistoricalWeeks && isFirstScoringWeek;
                    const isHistorical = week.isHistorical ?? false;
                    // Only show credits for the 6 scoring weeks (not historical, not current week)
                    const isScoringWeek =
                      idx >= firstScoringWeekIndex &&
                      idx < firstScoringWeekIndex + 6;
                    if (!isScoringWeek) {
                      // For non-scoring weeks, show empty cell or separator
                      return (
                        <React.Fragment
                          key={`credits-${week.weekStart}-${idx}`}
                        >
                          {(showSeparatorBeforeCurrent ||
                            showSeparatorBeforeScoring) && (
                            <td className="hidden px-1 py-1 md:table-cell"></td>
                          )}
                          <td
                            key={`credits-td-${week.weekStart}-${idx}`}
                            className={`px-1 py-1 text-center align-middle text-xs text-muted-foreground ${
                              isHistorical ? "hidden md:table-cell" : ""
                            }`}
                          ></td>
                        </React.Fragment>
                      );
                    }
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
                      <React.Fragment key={`credits-${week.weekStart}-${idx}`}>
                        {(showSeparatorBeforeCurrent ||
                          showSeparatorBeforeScoring) && (
                          <td className="hidden px-1 py-1 md:table-cell"></td>
                        )}
                        <td
                          key={`credits-td-${week.weekStart}-${idx}`}
                          className="px-1 py-1 text-center align-middle text-xs text-muted-foreground"
                        >
                          {totalCredits > 0 ? `+${totalCredits}` : ""}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!compact && showMaxCreditsHelper && (
          <div className="mt-1 text-center text-xs italic text-muted-foreground">
            Max +3 credits/week, +1 per unique zone (+0.5 for MC)
          </div>
        )}
      </div>
    </div>
  );
}
