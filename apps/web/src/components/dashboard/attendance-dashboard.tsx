"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import React from "react";
import {AttendanceReport} from "~/components/dashboard/attendance-report";
import {RecentTrackedRaids} from "~/components/dashboard/recent-tracked-raids";

export function AttendanceDashboard() {
  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <div className="w-full lg:w-1/2">
        <AttendanceReport />
      </div>
      <div className="w-full lg:w-1/2">
        <RecentTrackedRaids />
      </div>
    </div>
  );
};
