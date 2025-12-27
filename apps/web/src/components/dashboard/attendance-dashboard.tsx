"use client";

import React from "react";
import { AttendanceReport } from "~/components/dashboard/attendance-report";
import { RecentTrackedRaids } from "~/components/dashboard/recent-tracked-raids";
import { CurrentLockoutAllRaids } from "~/components/dashboard/current-lockout-all-raids";
import type { Session } from "next-auth";
import DashboardBanner from "~/components/dashboard/dashboard-banner";
import { PersonalAttendanceSummary } from "~/components/dashboard/personal-attendance-summary";

export function AttendanceDashboard({
  currentUserSession,
}: {
  currentUserSession?: Session;
}) {
  return (
    <div>
      <DashboardBanner session={currentUserSession} />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex flex-grow flex-col gap-4">
          <div>
            <PersonalAttendanceSummary
              currentUserSession={currentUserSession}
              currentUserCharacterId={currentUserSession?.user?.characterId}
            />
          </div>
          <div>
            <CurrentLockoutAllRaids />
          </div>
          <div>
            <RecentTrackedRaids />
          </div>
        </div>
        <div className="flex-shrink-0 lg:w-[420px]">
          <AttendanceReport
            currentUserCharacterId={currentUserSession?.user?.characterId}
          />
        </div>
      </div>
    </div>
  );
}
