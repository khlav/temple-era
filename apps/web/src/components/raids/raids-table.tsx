"use client"

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
import {Badge} from "~/components/ui/badge";
import {RaidAttendenceWeightBadge} from "~/components/raids/raid-attendance-weight-badge";

export function RaidsTable({ raids }: { raids: Raid[] | undefined }) {
  return (
    <div className="max-h-[600px] overflow-x-hidden overflow-y-auto">
      <Table className="max-h-[400px]">
        <TableCaption>
          Note: Only Tracked raids are considered for attendance restrictions.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">Raid</TableHead>
            <TableHead className="w-1/4">Date</TableHead>
            <TableHead className="w-1/4">Attendance Tracking</TableHead>
            <TableHead className="w-1/4">Created By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {raids
            ? raids.map((r: Raid) => (
                <TableRow key={r.raidId}>
                  <TableCell>
                    <Link
                      className="hover:text-primary group w-full transition-all hover:font-bold"
                      target="_self"
                      href={"/raids/" + r.raidId}
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.date).toLocaleDateString("en-US", {
                      timeZone: "UTC",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <RaidAttendenceWeightBadge attendanceWeight={r.attendanceWeight} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <UserAvatar
                      name={r.creator?.name ?? ""}
                      image={r.creator?.image ?? ""}
                    />
                  </TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
    </div>
  );
}
