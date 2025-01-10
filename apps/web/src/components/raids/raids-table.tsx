"use client";

import { Raid } from "~/server/api/interfaces/raid";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import anyAscii from "any-ascii";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import UserAvatar from "~/components/ui/user-avatar";
import { Badge } from "~/components/ui/badge";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import {GenerateWCLReportUrl, PrettyPrintDate} from "~/lib/helpers";

export function RaidsTable({ raids }: { raids: Raid[] | undefined }) {
  return (
    <div className="min-h-[600px] max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-hidden">
      <Table className="text-muted-foreground max-h-[400px] whitespace-nowrap">
        <TableCaption>
          Note: Only Tracked raids are considered for attendance restrictions.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-4/12">Raid</TableHead>
            <TableHead className="w-2/12">Zone</TableHead>
            <TableHead className="w-2/12">Date</TableHead>
            <TableHead className="w-2/12">Attendance</TableHead>
            <TableHead className="w-1/12">Created By</TableHead>
            <TableHead className="w-1/12 text-center">WCL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {raids
            ? raids.map((r: Raid) => (
                <TableRow key={r.raidId}>
                  <TableCell className="text-secondary-foreground">
                    <Link
                      className="hover:text-primary group w-full transition-all hover:font-bold"
                      target="_self"
                      href={"/raids/" + r.raidId}
                    >
                      {r.name}
                    </Link>
                    {(r.raidLogIds ?? []).length == 0 && <Badge variant="destructive" className="ml-2">Error: No logs found</Badge>}
                  </TableCell>
                  <TableCell>
                    {r.zone}
                  </TableCell>
                  <TableCell>
                    {PrettyPrintDate(new Date(r.date), true)}
                  </TableCell>
                  <TableCell>
                    <RaidAttendenceWeightBadge
                      attendanceWeight={r.attendanceWeight}
                    />
                  </TableCell>
                  <TableCell>
                    <UserAvatar
                      name={r.creator?.name ?? ""}
                      image={r.creator?.image ?? ""}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    {(r.raidLogIds ?? []).map((raidLogId, i) => {
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
            : null}
        </TableBody>
      </Table>
    </div>
  );
}
