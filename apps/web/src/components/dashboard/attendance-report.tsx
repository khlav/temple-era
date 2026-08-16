"use client";

import React from "react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "~/lib/utils";

const ROW_HEIGHT = "1.6875rem"; // ~27px per the pattern spec's dense-list row height

export function AttendanceReport({ currentUserCharacterId }: { currentUserCharacterId?: number }) {
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
      .filter((raider) => (raider.weightedAttendance ?? 0) >= minDisplayThreshold)
      .map((raider) => ({
        ...raider,
        weightedAttendance: raider.weightedAttendance ?? 0,
        attendancePercent: Math.round(((raider.weightedAttendance ?? 0) / maxAttendance) * 100),
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
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex flex-row gap-1">
          <div className="grow-0">Player attendance</div>
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
                <div className="italic">Note: Points are only earned once per zone+week.</div>
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
          <div className="max-h-[420px] overflow-y-auto pr-1">
            {raiders.map((raider, index) => {
              const isHighlighted = raider.isCurrentUser;
              const barColor = isHighlighted
                ? "bg-cyan-400"
                : raider.isEligible
                  ? "bg-primary"
                  : "bg-muted-foreground/45";

              return (
                <div
                  key={raider.characterId ?? index}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded transition-opacity hover:opacity-80",
                    isHighlighted && "bg-cyan-400/6",
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => handleRowClick(raider.characterId)}
                >
                  <div
                    className={cn(
                      "w-24 shrink-0 truncate text-right text-xs leading-none",
                      isHighlighted ? "font-bold text-cyan-200" : "text-muted-foreground",
                    )}
                  >
                    {raider.name ?? "Unknown"}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative min-w-0 flex-1">
                        <Progress
                          value={raider.attendancePercent}
                          className="h-[7px] bg-muted"
                          indicatorClassName={barColor}
                        />
                        <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-[7px] border-l border-dotted border-foreground/40" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-secondary text-muted-foreground">
                      <div className="text-xs">{raider.weightedAttendance} of 18</div>
                    </TooltipContent>
                  </Tooltip>
                  <div
                    className={cn(
                      "w-8 shrink-0 text-[11px] leading-none",
                      isHighlighted ? "text-cyan-200" : "text-muted-foreground",
                    )}
                  >
                    {raider.attendancePercent}%
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          "Loading..."
        )}
      </CardContent>
    </Card>
  );
}
