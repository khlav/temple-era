"use client";

import React from "react";
import { AttendanceReport } from "~/components/dashboard/attendance-report";
import { RecentTrackedRaids } from "~/components/dashboard/recent-tracked-raids";
import { CurrentLockoutAllRaids } from "~/components/dashboard/current-lockout-all-raids";
import type { Session } from "next-auth";
import DashboardBanner from "~/components/dashboard/dashboard-banner";
import { PersonalAttendanceSummary } from "~/components/dashboard/personal-attendance-summary";
import { UpcomingEvents } from "~/components/dashboard/upcoming-events";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function AttendanceDashboard({
  currentUserSession,
}: {
  currentUserSession?: Session;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DashboardBanner session={currentUserSession} />

      {/* Top Section: 50/50 two column layout */}
      <div className="relative">
        <div
          className={cn(
            "flex flex-col gap-4 transition-all duration-300 lg:flex-row",
            !currentUserSession &&
              "pointer-events-none select-none opacity-50 blur-[2px]",
          )}
        >
          <div className="flex-1">
            <PersonalAttendanceSummary
              currentUserSession={currentUserSession}
              currentUserCharacterId={currentUserSession?.user?.characterId}
            />
          </div>
          <div className="flex-1">
            <UpcomingEvents session={currentUserSession} />
          </div>
        </div>

        {!currentUserSession && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="w-2/3 rounded-lg border bg-card/80 p-6 text-center shadow-lg backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <Button
                  onClick={() =>
                    signIn("discord", { redirectTo: "/?signin=1" })
                  }
                  className="flex items-center gap-2 bg-[#5865F2] text-white hover:bg-[#8891f2]"
                >
                  <Image
                    src="/img/discord-mark-white.svg"
                    alt="Discord"
                    height={18}
                    width={18}
                  />
                  Sign in with Discord
                </Button>
                <p className="text-sm text-muted-foreground">
                  to view your attendance summary and see upcoming events.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section: 2/3 + 1/3 layout */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex flex-grow flex-col gap-4 lg:w-2/3">
          <div>
            <CurrentLockoutAllRaids />
          </div>
          <div>
            <RecentTrackedRaids />
          </div>
        </div>
        <div className="flex-shrink-0 lg:w-1/3">
          <AttendanceReport
            currentUserCharacterId={currentUserSession?.user?.characterId}
          />
        </div>
      </div>
    </div>
  );
}
