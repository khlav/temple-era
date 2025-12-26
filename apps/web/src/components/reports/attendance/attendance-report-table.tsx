"use client";

import { useMemo } from "react";
import { Card, CardContent } from "~/components/ui/card";
import { XIcon } from "lucide-react";
import { AttendanceStatusIcon } from "~/components/ui/attendance-status-icon";
import { PrettyPrintDate } from "~/lib/helpers";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { ClassIcon } from "~/components/ui/class-icon";
import { TableAddCharacterHeader } from "./table-add-character-header";

// Calculate lockout week (Tuesday to Monday) for a given date
// SQL: date_trunc('week', date - 1) + INTERVAL '1 day'
// This gives us the Tuesday of the lockout week
function getLockoutWeek(date: Date): Date {
  const d = new Date(date);
  // Subtract 1 day
  d.setUTCDate(d.getUTCDate() - 1);
  // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = d.getUTCDay();
  // Calculate days to subtract to get to Monday (start of week)
  // Monday is day 1, so we subtract (dayOfWeek - 1) mod 7, but handle Sunday (0) specially
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysToMonday);
  // Now we're at Monday, add 1 day to get Tuesday
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Format lockout week as "Month day to Month Day"
function formatLockoutWeek(startDate: Date): string {
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6); // Monday (6 days after Tuesday)

  const startMonth = startDate.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const startDay = startDate.getUTCDate();
  const endMonth = endDate.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const endDay = endDate.getUTCDate();

  return `${startMonth} ${startDay} to ${endMonth} ${endDay}`;
}

export function AttendanceReportTable({
  raids,
  characters,
  attendance,
  selectedCharacterIds,
  onAddCharacter,
  onRemoveCharacter,
}: {
  raids: Array<{ raidId: number; name: string; date: string; zone: string }>;
  characters: Array<{ characterId: number; name: string; class: string }>;
  attendance: Array<{
    raidId: number;
    primaryCharacterId: number;
    status: string | null;
  }>;
  selectedCharacterIds: number[];
  onAddCharacter: (characterId: number) => void;
  onRemoveCharacter: (characterId: number) => void;
}) {
  // Build attendance lookup map
  const attendanceMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of attendance) {
      const key = `${entry.raidId}-${entry.primaryCharacterId}`;
      map.set(key, entry.status);
    }
    return map;
  }, [attendance]);

  const getAttendanceStatus = (
    raidId: number,
    characterId: number,
  ): "attendee" | "bench" | null => {
    const key = `${raidId}-${characterId}`;
    const status = attendanceMap.get(key);
    if (status === "attendee" || status === "bench") {
      return status;
    }
    return null;
  };

  // Group raids by lockout week and calculate rowspans
  const raidsWithLockout = useMemo(() => {
    const grouped = new Map<
      string,
      Array<{ raid: (typeof raids)[0]; index: number }>
    >();

    raids.forEach((raid, index) => {
      const raidDate = new Date(raid.date);
      const lockoutWeek = getLockoutWeek(raidDate);
      const lockoutKey = lockoutWeek.toISOString().split("T")[0] ?? "";

      if (!grouped.has(lockoutKey)) {
        grouped.set(lockoutKey, []);
      }
      grouped.get(lockoutKey)!.push({ raid, index });
    });

    // Calculate rowspans for each raid
    return raids.map((raid, index) => {
      const raidDate = new Date(raid.date);
      const lockoutWeek = getLockoutWeek(raidDate);
      const lockoutKey = lockoutWeek.toISOString().split("T")[0] ?? "";
      const weekRaids = grouped.get(lockoutKey)!;
      const weekIndex = weekRaids.findIndex((r) => r.index === index);
      const isFirstInWeek = weekIndex === 0;
      const rowspan = isFirstInWeek ? weekRaids.length : 0; // 0 means skip this cell

      return {
        raid,
        lockoutWeek,
        lockoutKey,
        rowspan,
        isFirstInWeek,
      };
    });
  }, [raids]);

  if (raids.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="overflow-hidden rounded-xl p-0">
        <div className="max-h-[calc(100vh-200px)] min-h-[700px] overflow-x-auto overflow-y-auto">
          <div className="relative w-full">
            <table className="w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-[15] border-b bg-background shadow-[0_1px_0_0_hsl(var(--border))] [&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="sticky left-0 top-0 z-[15] h-10 w-[75px] min-w-[75px] max-w-[75px] border-r bg-background px-2 text-center align-middle font-medium text-muted-foreground first:rounded-tl-xl">
                    Lockout
                  </th>
                  <th className="sticky left-[75px] top-0 z-[15] h-10 w-[170px] min-w-[170px] max-w-[170px] border-r bg-background px-2 text-left align-middle font-medium text-muted-foreground">
                    Raids {raids ? `(${raids.length})` : ""}
                  </th>
                  {characters.map((char) => (
                    <th
                      key={char.characterId}
                      className="h-10 min-w-[150px] max-w-[300px] px-2 text-center align-middle font-medium text-muted-foreground"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <ClassIcon characterClass={char.class} px={20} />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium">{char.name}</span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-secondary text-muted-foreground">
                            {char.class}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onRemoveCharacter(char.characterId)}
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </th>
                  ))}
                  {/* Add character column - always rightmost */}
                  <th className="h-10 w-full px-2 text-left align-middle font-medium text-muted-foreground last:rounded-tr-xl">
                    <TableAddCharacterHeader
                      selectedCharacterIds={selectedCharacterIds}
                      onAddCharacter={onAddCharacter}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {raidsWithLockout.map(
                  ({
                    raid,
                    lockoutWeek,
                    lockoutKey,
                    rowspan,
                    isFirstInWeek,
                  }) => {
                    // Create a unique group name for this lockout week
                    const lockoutGroup = `lockout-${lockoutKey}`;
                    return (
                      <tr
                        key={raid.raidId}
                        className={`${lockoutGroup} group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted`}
                        onMouseEnter={() => {
                          // Highlight lockout cell when any row in this lockout week is hovered
                          const lockoutCell = document.querySelector(
                            `.lockout-cell-${lockoutKey}`,
                          );
                          if (lockoutCell) {
                            lockoutCell.classList.add("bg-muted/50");
                          }
                        }}
                        onMouseLeave={() => {
                          const lockoutCell = document.querySelector(
                            `.lockout-cell-${lockoutKey}`,
                          );
                          if (lockoutCell) {
                            lockoutCell.classList.remove("bg-muted/50");
                          }
                        }}
                      >
                        {isFirstInWeek && (
                          <td
                            rowSpan={rowspan}
                            className={`lockout-cell-${lockoutKey} sticky left-0 z-10 w-[75px] min-w-[75px] max-w-[75px] border-r bg-background p-2 text-center align-middle transition-colors group-hover:bg-transparent [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]`}
                          >
                            <div className="flex h-full items-center justify-center">
                              <span className="text-xs text-muted-foreground">
                                {formatLockoutWeek(lockoutWeek)}
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="sticky left-[75px] z-10 w-[170px] min-w-[170px] max-w-[170px] border-r bg-background p-2 align-middle font-medium group-hover:bg-transparent [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                          <Link
                            className="group w-full transition-all hover:text-primary"
                            target="_self"
                            href={"/raids/" + raid.raidId}
                          >
                            <div>{raid.name}</div>
                            <div className="text-xs tracking-tight text-muted-foreground">
                              {PrettyPrintDate(new Date(raid.date), true)}
                            </div>
                          </Link>
                        </td>
                        {characters.map((char) => {
                          const status = getAttendanceStatus(
                            raid.raidId,
                            char.characterId,
                          );
                          // Add background color based on status
                          const bgClass =
                            status === "attendee"
                              ? "bg-chart-2/20"
                              : status === "bench"
                                ? "bg-muted-foreground/20"
                                : "";
                          return (
                            <td
                              key={char.characterId}
                              className={`min-w-[150px] max-w-[300px] p-2 text-center align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] ${bgClass}`}
                            >
                              <AttendanceStatusIcon
                                status={status}
                                size={20}
                                variant="inline"
                                iconClassName={
                                  status === "attendee"
                                    ? "text-chart-2"
                                    : "text-muted-foreground"
                                }
                              />
                            </td>
                          );
                        })}
                        {/* Empty cell for add character column */}
                        <td className="w-full p-2 text-left align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                          {/* Empty - add column is header only */}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
