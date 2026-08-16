"use client";

import React from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Progress } from "~/components/ui/progress";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "~/lib/utils";

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
    <div className="panel-surface flex h-full flex-col overflow-hidden rounded-2xl border border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
            Attendance Leaderboard
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle size={13} className="text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right" className="rounded-md bg-secondary text-muted-foreground">
              <div>Each week, raiders can earn up to 3pts:</div>
              <div className="pt-1">
                - Naxx, AQ40, BWL : +1
                <br />- Molten Core : +0.5
              </div>
              <div className="italic">Note: Points are only earned once per zone+week.</div>
              <div className="mt-1 border-t border-border/60 pt-1">
                Last 6 full lockouts · 50%+ = able to SR
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <Link
          href="/reports/attendance"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          Report
        </Link>
      </div>

      {isSuccess ? (
        <div className="max-h-[min(52svh,30rem)] flex-1 overflow-y-auto">
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
                  "flex cursor-pointer items-center gap-2 border-b border-border/35 px-4 py-1 transition-opacity last:border-b-0 hover:opacity-80",
                  isHighlighted && "bg-cyan-400/6",
                )}
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
                    <div className="relative min-w-0 flex-1 py-[3px]">
                      <Progress
                        value={raider.attendancePercent}
                        className="h-2.5 bg-muted"
                        indicatorClassName={barColor}
                      />
                      <div className="pointer-events-none absolute left-1/2 -top-[3px] -bottom-[3px] z-10 w-px bg-neutral-500" />
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
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      )}
    </div>
  );
}
