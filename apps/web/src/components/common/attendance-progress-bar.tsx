"use client";

import React from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

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
  const progressColor = isAboveThreshold ? "bg-chart-2" : "bg-gray-400";

  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-help items-center gap-2 pt-2">
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
              {/* 50% dotted line */}
              <div
                className="absolute top-0 h-4 border-l-2 border-dotted border-muted-foreground"
                style={{ left: "50%" }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">
          <div className="text-xs">
            {weightedAttendance} of 18 attendance credits
          </div>
        </TooltipContent>
      </Tooltip>
      {showEligibility && (
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
      )}
    </div>
  );
}
