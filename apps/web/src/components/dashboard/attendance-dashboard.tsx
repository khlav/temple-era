"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import React from "react";
import {AttendanceReport} from "~/components/dashboard/attendance-report";
import {RecentTrackedRaids} from "~/components/dashboard/recent-tracked-raids";

export function AttendanceDashboard() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="grow-0">
        <AttendanceReport />
      </div>
      <div className="grow">
        <RecentTrackedRaids />
      </div>
    </div>
  );
};
