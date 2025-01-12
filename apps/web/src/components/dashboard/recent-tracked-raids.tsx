"use client";

import React from "react";
import { api } from "~/trpc/react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import Link from "next/link";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { ExternalLinkIcon } from "lucide-react";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { RecentTrackedRaidsTableRowSkeleton } from "~/components/dashboard/skeleton";
import {Card, CardContent, CardHeader} from "~/components/ui/card";

export function RecentTrackedRaids() {
  const { data: trackedRaidData, isLoading } =
    api.dashboard.getTrackedRaidsL6LockoutWk.useQuery();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-end text-nowrap">
          <div className="grow-0">Tracked Raids</div>
          <div className="text-muted-foreground grow pb-0.5 px-2 text-sm">
            Last 6 lockouts
          </div>
          <div className="text-primary grow-0 text-sm pb-0.5 hover:underline">
            <Link href="/raids">View raids</Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
          <Table className="text-muted-foreground max-h-[400px] whitespace-nowrap">
            <TableCaption className="text-wrap"></TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-5/8 md:w-4/12">Raid</TableHead>
                <TableHead className="w-2/8 md:w-2/12">Attendance</TableHead>
                <TableHead className="w-1/8 text-center md:w-1/12">
                  WCL
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <RecentTrackedRaidsTableRowSkeleton />
              ) : (
                (trackedRaidData ?? []).map((r) => (
                  <TableRow key={r.raidId}>
                    <TableCell className="text-secondary-foreground">
                      <Link
                        className="hover:text-primary group w-full transition-all"
                        target="_self"
                        href={"/raids/" + r.raidId}
                      >
                        <div>{r.name}</div>
                        <div className="text-muted-foreground text-xs tracking-tight">
                          {PrettyPrintDate(new Date(r.date), true)}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <RaidAttendenceWeightBadge
                        attendanceWeight={r.attendanceWeight}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {(r.raidLogIds ?? []).map((raidLogId) => {
                        const reportUrl = GenerateWCLReportUrl(raidLogId);
                        return (
                          <Link
                            key={raidLogId}
                            href={reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary group text-sm transition-all hover:underline"
                          >
                            <ExternalLinkIcon
                              className="ml-1 inline-block align-text-top"
                              size={15}
                            />
                          </Link>
                        );
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
      </CardContent>
    </Card>
  );
}
