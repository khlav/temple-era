"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { ExternalLinkIcon } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { AttendanceStatusIcon } from "~/components/ui/attendance-status-icon";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { RecentTrackedRaidsTableRowSkeleton } from "~/components/dashboard/skeletons";
import { getInstanceIdForZoneName } from "~/lib/raid-zones";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";

type ListedRaid = RouterOutputs["dashboard"]["getTrackedRaidsL6LockoutWk"][number];

const ZONE_TILE_ORDER: {
  id: string;
  label: string;
  className: string;
  activeClassName: string;
}[] = [
  {
    id: "naxxramas",
    label: "Naxx",
    className: "text-zone-naxx-text border-zone-naxx-border/40",
    activeClassName: "text-zone-naxx-text border-zone-naxx-border bg-zone-naxx-bg/25",
  },
  {
    id: "aq40",
    label: "AQ40",
    className: "text-zone-aq40-text border-zone-aq40-border/40",
    activeClassName: "text-zone-aq40-text border-zone-aq40-border bg-zone-aq40-bg/25",
  },
  {
    id: "bwl",
    label: "BWL",
    className: "text-zone-bwl-text border-zone-bwl-border/40",
    activeClassName: "text-zone-bwl-text border-zone-bwl-border bg-zone-bwl-bg/25",
  },
  {
    id: "mc",
    label: "MC",
    className: "text-zone-mc-text border-zone-mc-border/45",
    activeClassName: "text-zone-mc-text border-zone-mc-border bg-zone-mc-bg/25",
  },
  {
    id: "zg",
    label: "ZG",
    className: "text-zone-zg-text border-zone-zg-border/40",
    activeClassName: "text-zone-zg-text border-zone-zg-border bg-zone-zg-bg/25",
  },
  {
    id: "aq20",
    label: "AQ20",
    className: "text-zone-aq20-text border-zone-aq20-border/40",
    activeClassName: "text-zone-aq20-text border-zone-aq20-border bg-zone-aq20-bg/25",
  },
  {
    id: "onyxia",
    label: "Ony",
    className: "text-zone-ony-text border-zone-ony-border/40",
    activeClassName: "text-zone-ony-text border-zone-ony-border bg-zone-ony-bg/25",
  },
];

/** Shared by CurrentLockoutAllRaids and RecentTrackedRaids — zone tiles double as toggle
 *  filters (OR across selected zones; none selected shows everything) sitting above a raids
 *  table, same shape for both widgets per design feedback. */
export function RaidsListCard({
  title,
  viewAllHref,
  raids,
  isLoading,
}: {
  title: string;
  viewAllHref: string;
  raids: ListedRaid[] | undefined;
  isLoading: boolean;
}) {
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const zoneCounts: Record<string, number> = {};
    for (const r of raids ?? []) {
      const zoneId = getInstanceIdForZoneName(r.zone);
      if (zoneId) zoneCounts[zoneId] = (zoneCounts[zoneId] ?? 0) + 1;
    }
    return zoneCounts;
  }, [raids]);

  const toggleZone = (id: string) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredRaids = useMemo(() => {
    if (selectedZones.size === 0) return raids ?? [];
    return (raids ?? []).filter((r) => {
      const zoneId = getInstanceIdForZoneName(r.zone);
      return !!zoneId && selectedZones.has(zoneId);
    });
  }, [raids, selectedZones]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </div>
        <Link
          href={viewAllHref}
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          View all raids
        </Link>
      </div>
      <CardContent className="space-y-4 pt-4 sm:pt-4">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {ZONE_TILE_ORDER.map((zone) => {
              const count = counts[zone.id] ?? 0;
              const isActive = selectedZones.has(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => toggleZone(zone.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border bg-card/60 px-2 py-2.5 transition-colors",
                    isActive ? zone.activeClassName : cn(zone.className, "hover:bg-accent/40"),
                  )}
                >
                  <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {zone.label}
                  </span>
                  <span className="font-display text-[1.4rem] font-bold leading-none">
                    {count > 0 ? count : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

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
            ) : filteredRaids.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {selectedZones.size > 0 ? "No raids for the selected zones." : "No raids found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredRaids.map((r) => (
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
                        {r.currentUserAttendance === "bench" && (
                          <AttendanceStatusIcon status="bench" size={14} variant="inline" />
                        )}
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
