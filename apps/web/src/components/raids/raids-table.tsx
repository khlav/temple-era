"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import UserAvatar from "~/components/ui/user-avatar";
import { Badge } from "~/components/ui/badge";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import type { Session } from "next-auth";

export function RaidsTable({
  raids,
  session,
}: {
  raids: Raid[] | undefined;
  session?: Session;
}) {
  return (
    <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
      <div className="relative w-full">
        <table className="w-full caption-bottom whitespace-nowrap text-sm text-muted-foreground">
          <caption className="mt-4 text-wrap text-sm text-muted-foreground">
            Note: Only Tracked raids are considered for attendance restrictions.
          </caption>
          <thead className="sticky top-0 z-10 border-b bg-background [&_tr]:border-b">
            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              {session?.user?.isRaidManager && (
                <th className="h-10 w-40 px-2 text-left align-middle font-medium text-muted-foreground">
                  {" "}
                </th>
              )}
              <th className="h-10 w-1/2 px-2 text-left align-middle font-medium text-muted-foreground md:w-4/12">
                Raids {raids ? `(${raids?.length})` : ""}
              </th>
              <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell md:w-2/12">
                Zone
              </th>
              <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell md:w-2/12">
                Date
              </th>
              <th className="h-10 w-1/4 px-2 text-left align-middle font-medium text-muted-foreground md:w-2/12">
                Attendance
              </th>
              <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell md:w-1/12">
                Created By
              </th>
              <th className="h-10 w-1/4 px-2 text-left text-center align-middle font-medium text-muted-foreground md:w-1/12">
                WCL
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {raids
              ? raids.map((r: Raid) => (
                  <tr
                    key={r.raidId}
                    className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                  >
                    {session?.user?.isRaidManager && (
                      <td className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        <Link
                          href={`/raids/${r.raidId}/edit`}
                          className="transition-all hover:text-primary"
                        >
                          <Edit
                            className="opacity-0 group-hover:opacity-100"
                            size={16}
                          />
                        </Link>
                      </td>
                    )}
                    <td className="p-2 align-middle text-secondary-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      <Link
                        className="group w-full transition-all hover:text-primary"
                        target="_self"
                        href={"/raids/" + r.raidId}
                      >
                        <div>{r.name}</div>
                        <div className="text-xs text-muted-foreground md:hidden">
                          {PrettyPrintDate(new Date(r.date), true)}
                        </div>
                      </Link>
                      {(r.raidLogIds ?? []).length == 0 && (
                        <Badge variant="destructive" className="ml-2">
                          Error: No logs found
                        </Badge>
                      )}
                    </td>
                    <td className="hidden p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      {r.zone}
                    </td>
                    <td className="hidden p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      {PrettyPrintDate(new Date(r.date), true)}
                    </td>
                    <td className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      <RaidAttendenceWeightBadge
                        attendanceWeight={r.attendanceWeight}
                      />
                    </td>
                    <td className="hidden p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      <UserAvatar
                        name={r.creator?.name ?? ""}
                        image={r.creator?.image ?? ""}
                      />
                    </td>
                    <td className="p-2 text-center align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
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
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
