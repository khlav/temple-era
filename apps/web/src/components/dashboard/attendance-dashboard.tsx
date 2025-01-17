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
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { signIn } from "next-auth/react";
import {Button} from "~/components/ui/button";


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
      {!currentUserSession?.user?.characterId && (
        <div className="border-1 my-2 flex w-full flex-col rounded-lg border border-muted p-2 md:flex-row">
          <div className="relative h-20 min-w-60">
            <Image
              src={"/img/chart_dunckan.png"}
              fill
              objectFit="contain"
              alt="Example with highlighted character"
            />
          </div>
          <div className="relative flex h-20 grow flex-row">
            <div className="my-auto grow-0">
              <CircleAlert className="text-yellow-600" />
            </div>
            <div className="my-auto grow pl-2">
              {!currentUserSession?.user ? (
                <>
                  <div>Highlight your attendance by{" "}
                  <Link href="/" onClick={() => signIn("discord")} className="text-primary underline">
                    logging in with Discord
                  </Link></div>
                  <div>and adding a primary character to your profile.</div>
                </>
              ) : (
                <>
                  <Link href="/profile" className="text-primary underline">
                    Add a primary character to your profile
                  </Link>
                  .
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
