"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import React from "react";
import { AttendanceReport } from "~/components/dashboard/attendance-report";
import { RecentTrackedRaids } from "~/components/dashboard/recent-tracked-raids";
import { api } from "~/trpc/react";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { PrettyPrintDate } from "~/lib/helpers";
import {CurrentLockoutAllRaids} from "~/components/dashboard/current-lockout-all-raids";

export function AttendanceDashboard() {
  const { data: reportDates, isSuccess } =
    api.dashboard.getReportDates.useQuery();

  return (
    <div>
      <div className="text-muted-foreground mb-2">
        {isSuccess ? (
          <>
            Last 6 full lockouts:{" "}
            {PrettyPrintDate(new Date(reportDates?.reportPeriodStart ?? ""), true)}
            {" to "}
            {PrettyPrintDate(new Date(reportDates?.reportPeriodEnd ?? ""), true)}
          </>
        ) : (
          <Skeleton className="h-6 w-60 rounded-xl"/>
        )}
      </div>
      <Separator className="mb-4"/>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-[420px] flex-shrink-0">
          <AttendanceReport/>
        </div>
        <div className="flex flex-col flex-grow gap-4">
          <div>
            <RecentTrackedRaids/>
          </div>
          <div>
            <CurrentLockoutAllRaids/>
          </div>
        </div>
      </div>


    </div>
  );
}
