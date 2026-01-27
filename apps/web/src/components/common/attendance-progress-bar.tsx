"use client";

import React from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";
import { env } from "~/env";

interface AttendanceProgressBarProps {
  attendancePct: number;
  weightedAttendance: number;
  showEligibility?: boolean;
}

export function AttendanceProgressBar({
  attendancePct,
  weightedAttendance,
  showEligibility = true,
}: AttendanceProgressBarProps) {
  const attendancePercent = Math.round(attendancePct * 100);
  const isAboveThreshold = attendancePercent >= 50;

  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-help items-center gap-2 pt-2">
            <span className="text-2xl font-bold leading-none">
              {attendancePercent}%
            </span>
            <div className="relative flex-1">
              <Progress
                value={attendancePercent}
                className="h-4 bg-muted"
                indicatorClassName={cn(
                  isAboveThreshold ? "bg-chart-2" : "bg-gray-400",
                )}
              />
              {/* 50% dotted line */}
              <div
                className={cn(
                  "pointer-events-none absolute top-0 h-4 border-l-2 border-dotted",
                  isAboveThreshold
                    ? "border-background"
                    : "border-muted-foreground",
                )}
                style={{ left: "50%" }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">
          <div className="text-xs">{weightedAttendance} of 18</div>
        </TooltipContent>
      </Tooltip>
      {showEligibility && (
        <div className="mt-[1px] flex justify-end text-xs text-muted-foreground">
          {isAboveThreshold ? (
            <span>
              <span className="text-chart-2">Eligible</span> to SR{" "}
              <Link
                href={env.NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL}
                target="_blank"
                className="underline hover:text-foreground"
              >
                restricted Naxx items
              </Link>
            </span>
          ) : (
            <span>
              <span className="text-gray-400">Not Eligible</span> to SR{" "}
              <Link
                href={env.NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL}
                target="_blank"
                className="underline hover:text-foreground"
              >
                restricted Naxx items
              </Link>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
