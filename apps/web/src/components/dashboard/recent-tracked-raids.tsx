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
import { ClassIcon } from "~/components/ui/class-icon";
import { RecentTrackedRaidsTableRowSkeleton } from "~/components/dashboard/skeletons";
import { Card, CardContent } from "~/components/ui/card";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { cn } from "~/lib/utils";

export function RecentTrackedRaids() {
  const { data: trackedRaidData, isLoading } = api.dashboard.getTrackedRaidsL6LockoutWk.useQuery();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          Raids from last 6 complete lockouts
        </div>
        <Link
          href="/raids"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          View all raids
        </Link>
      </div>
      <CardContent className="pt-4 sm:pt-4">
        <Table className="max-h-[400px] whitespace-nowrap text-muted-foreground">
          <TableCaption className="text-wrap"></TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-5/12">Raid</TableHead>
              <TableHead className="w-2/12">Attendance</TableHead>
              <TableHead className="w-3/12">Attended by</TableHead>
              <TableHead className="w-2/12 text-center">WCL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <RecentTrackedRaidsTableRowSkeleton />
            ) : (
              (trackedRaidData ?? []).map((r) => (
                <TableRow key={r.raidId} className={cn(!r.currentUserAttendance && "opacity-45")}>
                  <TableCell className="text-secondary-foreground">
                    <Link
                      className="group w-full transition-all hover:text-primary"
                      target="_self"
                      href={"/raids/" + r.raidId}
                    >
                      <div className="flex items-center gap-2">
                        <span>{r.name}</span>
                        <ZoneBadge zoneName={r.zone} />
                      </div>
                      <div className="text-xs tracking-tight text-muted-foreground">
                        {PrettyPrintDate(new Date(r.date), true)}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <RaidAttendenceWeightBadge attendanceWeight={r.attendanceWeight} />
                  </TableCell>
                  <TableCell>
                    {r.attendedCharacterName ? (
                      <div className="flex items-center gap-1.5">
                        {r.attendedCharacterClass && (
                          <ClassIcon characterClass={r.attendedCharacterClass} px={16} />
                        )}
                        <span className="truncate text-sm text-secondary-foreground">
                          {r.attendedCharacterName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
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
