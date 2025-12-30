"use client";

import React from "react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { useRouter } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "~/lib/utils";

export function AttendanceReport({
  currentUserCharacterId,
}: {
  currentUserCharacterId?: number;
}) {
  const attendanceThreshold = 9; // 50% threshold (9 of 18 points)
  const minDisplayThreshold = 2; // Minimum attendance to display
  const maxAttendance = 18; // Maximum possible attendance
  const router = useRouter();
  const { data: attendanceData, isSuccess } =
    api.character.getAllPrimaryRaidAttendanceL6LockoutWk.useQuery();

  // Filter and prepare raider data
  const raiders = React.useMemo(() => {
    if (!attendanceData) return [];
    return attendanceData
      .filter(
        (raider) => (raider.weightedAttendance ?? 0) >= minDisplayThreshold,
      )
      .map((raider) => ({
        ...raider,
        weightedAttendance: raider.weightedAttendance ?? 0,
        attendancePercent: Math.round(
          ((raider.weightedAttendance ?? 0) / maxAttendance) * 100,
        ),
        isEligible: (raider.weightedAttendance ?? 0) >= attendanceThreshold,
        isCurrentUser: currentUserCharacterId === raider.characterId,
      }));
  }, [attendanceData, currentUserCharacterId]);

  const handleRowClick = (characterId: number | null) => {
    if (characterId) {
      router.push(`/characters/${characterId}`);
    }
  };

  return (
    <Card className="min-h-[1700px]">
      <CardHeader className="pb-2">
        <div className="flex flex-row gap-1">
          <div className="grow-0">Raid Attendance Leaderboard</div>
          <div className="grow pt-1 text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle size="16" />
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="rounded-md bg-secondary text-muted-foreground"
              >
                <div>Each week, raiders can earn up to 3pts:</div>
                <div className="pt-1">
                  - Naxx, AQ40, BWL : +1
                  <br />- Molten Core : +0.5
                </div>
                <div className="italic">
                  Note: Points are only earned once per zone+week.
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="pb-0.5 text-sm text-muted-foreground">
          Last 6 full lockouts -- 50%+ = able to SR
        </div>
      </CardHeader>
      <CardContent>
        {isSuccess ? (
          <div className="mx-auto min-h-[600px] pr-4">
            {/* Raider List - using grid for table-like column widths */}
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5">
              {raiders.map((raider, index) => {
                const isHighlighted = raider.isCurrentUser;
                // Fill color: green for current user, primary for >=50%, gray for <50%
                const barColor = isHighlighted
                  ? "bg-chart-2"
                  : raider.isEligible
                    ? "bg-primary"
                    : "bg-gray-400";

                return (
                  <div
                    key={raider.characterId ?? index}
                    className="group contents cursor-pointer"
                    onClick={() => handleRowClick(raider.characterId)}
                  >
                    {/* Character Name */}
                    <div
                      className={cn(
                        "flex items-center justify-end whitespace-nowrap text-right text-xs leading-none transition-opacity group-hover:opacity-80",
                        isHighlighted
                          ? "font-bold text-chart-2"
                          : "text-muted-foreground",
                      )}
                      style={{ minHeight: "1rem", height: "1rem" }}
                    >
                      {raider.name ?? "Unknown"}
                    </div>

                    {/* Progress Bar Container with 50% reference line */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="relative min-w-0 transition-opacity group-hover:opacity-80"
                          style={{ minHeight: "1rem", height: "1rem" }}
                        >
                          <Progress
                            value={raider.attendancePercent}
                            className="h-4 bg-muted"
                            indicatorClassName={cn("rounded-full", barColor)}
                          />

                          {/* 50% Reference Line - always displayed */}
                          <div className="pointer-events-none absolute left-[50%] top-0 z-[1] h-4 border-l-2 border-dotted border-foreground/40" />

                          {/* Percentage Label */}
                          {raider.attendancePercent > 0 && (
                            <div
                              className={cn(
                                "pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap text-xs font-bold",
                                isHighlighted
                                  ? raider.attendancePercent >= 20
                                    ? "text-background"
                                    : "text-chart-2"
                                  : raider.attendancePercent >= 20
                                    ? "text-primary-foreground"
                                    : "text-muted-foreground",
                              )}
                              style={
                                raider.attendancePercent >= 20
                                  ? {
                                      // >= 20%: inside the end of filled bar, evenly spaced from right edge
                                      right: `${100 - raider.attendancePercent + 1.5}%`,
                                    }
                                  : {
                                      // < 20%: outside filled end, evenly spaced from right edge of fill
                                      left: `${raider.attendancePercent + 2}%`,
                                    }
                              }
                            >
                              {raider.attendancePercent}%
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-secondary text-muted-foreground">
                        <div className="text-xs">
                          {raider.weightedAttendance} of 18
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          "Loading..."
        )}
      </CardContent>
    </Card>
  );
}
