"use client";

import React from "react";
import { AttendanceReport } from "~/components/dashboard/attendance-report";
import { RecentTrackedRaids } from "~/components/dashboard/recent-tracked-raids";
import { api } from "~/trpc/react";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { PrettyPrintDate } from "~/lib/helpers";
import { CurrentLockoutAllRaids } from "~/components/dashboard/current-lockout-all-raids";
import type { Session } from "next-auth";
import {DashboardOnboarding} from "~/components/dashboard/dashboard-onboarding";
import DashboardBanner from "~/components/dashboard/dashboard-banner";

export function AttendanceDashboard({
  currentUserSession,
}: {
  currentUserSession?: Session;
}) {
  const { data: reportDates, isSuccess } =
    api.dashboard.getReportDates.useQuery();

  return (
    <div>
      <div className="mb-2 text-muted-foreground">
        {isSuccess ? (
          <>
            Last 6 full lockouts:{" "}
            {PrettyPrintDate(
              new Date(reportDates?.reportPeriodStart ?? ""),
              true,
            )}
            {" to "}
            {PrettyPrintDate(
              new Date(reportDates?.reportPeriodEnd ?? ""),
              true,
            )}
          </>
        ) : (
          <Skeleton className="h-6 w-60 rounded-xl" />
        )}
      </div>
      <Separator className="mb-4" />
      <DashboardOnboarding session={currentUserSession}/>
      <DashboardBanner />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-shrink-0 lg:w-[420px]">
          <AttendanceReport
            currentUserCharacterId={currentUserSession?.user?.characterId}
          />
        </div>
        <div className="flex flex-grow flex-col gap-4">
          <div>
            <RecentTrackedRaids />
          </div>
          <div>
            <CurrentLockoutAllRaids />
          </div>
        </div>
      </div>
    </div>
  );
}
