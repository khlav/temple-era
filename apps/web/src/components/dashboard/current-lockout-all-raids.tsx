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
import { AttendanceStatusIcon } from "~/components/ui/attendance-status-icon";
import { RecentTrackedRaidsTableRowSkeleton } from "~/components/dashboard/skeletons";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  getInstanceIdForZoneName,
  ZONE_BADGE_COMPACT_CLASSES,
  ZONE_ACCENT_CLASSES,
} from "~/lib/raid-zones";

export function CurrentLockoutAllRaids() {
  const { data: trackedRaidData, isLoading } =
    api.dashboard.getAllRaidsCurrentLockout.useQuery();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end">
          <div className="grow-0">Completed raids this lockout</div>
          <div className="grow text-left text-sm text-primary hover:underline sm:text-right">
            <Link href="/raids">View all raids</Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table className="max-h-[400px] whitespace-nowrap text-muted-foreground">
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
              <RecentTrackedRaidsTableRowSkeleton rows={3} />
            ) : (
              (trackedRaidData ?? []).map((r) => (
                <TableRow key={r.raidId}>
                  <TableCell className="text-secondary-foreground">
                    <div className="flex flex-row gap-2">
                      <div className="grow">
                        <Link
                          className="group w-full transition-all hover:text-primary"
                          target="_self"
                          href={"/raids/" + r.raidId}
                        >
                          <div className="flex items-center gap-2">
                            <span>{r.name}</span>
                            {(() => {
                              const zoneId = getInstanceIdForZoneName(r.zone);
                              return zoneId ? (
                                <Badge
                                  variant="outline"
                                  className={`${ZONE_ACCENT_CLASSES[zoneId]} ${ZONE_BADGE_COMPACT_CLASSES}`}
                                >
                                  {zoneId === "naxxramas"
                                    ? "NAXX"
                                    : zoneId.toUpperCase()}
                                </Badge>
                              ) : null;
                            })()}
                          </div>
                          <div className="text-xs tracking-tight text-muted-foreground">
                            {PrettyPrintDate(new Date(r.date), true)}
                          </div>
                        </Link>
                      </div>
                      <div className="my-auto grow-0">
                        {r.currentUserAttendance && (
                          <AttendanceStatusIcon
                            status={
                              r.currentUserAttendance === "bench"
                                ? "bench"
                                : "attendee"
                            }
                            size={20}
                            variant="centered"
                          />
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
                          className="group text-sm transition-all hover:text-primary hover:underline"
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
