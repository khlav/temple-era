"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import React from "react";
import { api } from "~/trpc/react";

export function AttendanceReport() {
  const {
    data: attendanceData,
    isLoading,
    isSuccess,
    isError,
  } = api.dashboard.getPrimaryRaidAttendanceL6LockoutWk.useQuery();

  return (
    <div className="max-h-[700px] overflow-hidden overflow-y-auto">
      {isSuccess ? (
        <LabeledArrayCodeBlock
          label="Attendance Data"
          value={JSON.stringify(attendanceData, null, 2)}
        />
      ) : (
        "Loading..."
      )}
    </div>
  );
}
