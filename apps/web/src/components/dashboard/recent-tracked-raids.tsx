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
import {Armchair, ExternalLinkIcon, Swords} from "lucide-react";
import { RecentTrackedRaidsTableRowSkeleton } from "~/components/dashboard/skeletons";
import {Card, CardContent, CardHeader} from "~/components/ui/card";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";

export function RecentTrackedRaids() {
  const { data: trackedRaidData, isLoading } =
    api.dashboard.getTrackedRaidsL6LockoutWk.useQuery();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-end text-nowrap">
          <div className="grow-0">
            Raids from last 6 complete lockouts
          </div>
          <div className="text-primary grow pb-0.5 text-sm text-right hover:underline">
            <Link href="/raids">View all raids</Link>
          </div>
        </div>
        <div className="text-muted-foreground grow text-sm">
          Used to calculate attendance & eligibility
          {trackedRaidData && trackedRaidData.length > 0
            && `, ${trackedRaidData.length} raid${trackedRaidData.length === 1 ? "" : "s"}`
            }
        </div>
      </CardHeader>
      <CardContent>
        <Table className="text-muted-foreground max-h-[400px] whitespace-nowrap">
          <TableCaption className="text-wrap"></TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-5/8 md:w-6/12">Raid</TableHead>
              <TableHead className="w-2/8 md:w-2/12">Attendance</TableHead>
              <TableHead className="w-1/8 text-center md:w-2/12">WCL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <RecentTrackedRaidsTableRowSkeleton />
            ) : (
              (trackedRaidData ?? []).map((r) => (
                <TableRow key={r.raidId}>
                  <TableCell className="text-secondary-foreground">
                    <div className="flex flex-row gap-2">
                      <div className="grow">
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
                      </div>
                      <div className="grow-0 my-auto">
                        { r.currentUserAttendance && (
                          r.currentUserAttendance == 'bench' ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Armchair
                                  className="text-chart-2 mx-auto"
                                  size={20}
                                />
                              </TooltipTrigger>
                              <TooltipContent className="bg-secondary text-muted-foreground">
                                Bench
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Swords
                                  className="text-chart-2 mx-auto"
                                  size={20}
                                />
                              </TooltipTrigger>
                              <TooltipContent className="bg-secondary text-muted-foreground">
                                Attended
                              </TooltipContent>
                            </Tooltip>
                          )
                        )}
                      </div>
                    </div>
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
