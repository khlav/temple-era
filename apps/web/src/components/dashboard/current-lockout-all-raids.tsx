"use client";

import React, { useMemo } from "react";
import { api } from "~/trpc/react";
import Link from "next/link";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { getInstanceIdForZoneName } from "~/lib/raid-zones";

const ZONE_TILE_ORDER: { id: string; label: string; className: string }[] = [
  { id: "naxxramas", label: "Naxx", className: "text-zone-naxx-text border-zone-naxx-border/40" },
  { id: "aq40", label: "AQ40", className: "text-zone-aq40-text border-zone-aq40-border/40" },
  { id: "bwl", label: "BWL", className: "text-zone-bwl-text border-zone-bwl-border/40" },
  { id: "mc", label: "MC", className: "text-zone-mc-text border-zone-mc-border/45" },
  { id: "zg", label: "ZG", className: "text-zone-zg-text border-zone-zg-border/40" },
  { id: "aq20", label: "AQ20", className: "text-zone-aq20-text border-zone-aq20-border/40" },
  { id: "onyxia", label: "Ony", className: "text-zone-ony-text border-zone-ony-border/40" },
];

export function CurrentLockoutAllRaids() {
  const { data: trackedRaidData, isLoading } = api.dashboard.getAllRaidsCurrentLockout.useQuery();

  const counts = useMemo(() => {
    const raids = trackedRaidData ?? [];
    const zoneCounts: Record<string, number> = {};
    for (const r of raids) {
      const zoneId = getInstanceIdForZoneName(r.zone);
      if (zoneId) zoneCounts[zoneId] = (zoneCounts[zoneId] ?? 0) + 1;
    }
    return zoneCounts;
  }, [trackedRaidData]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          Completed raids this lockout
        </div>
        <Link
          href="/raids"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          View all raids
        </Link>
      </div>
      <CardContent className="pt-4 sm:pt-4">
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
              return (
                <div
                  key={zone.id}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border bg-card/60 px-2 py-2.5",
                    zone.className,
                  )}
                >
                  <span className="font-display text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {zone.label}
                  </span>
                  <span className="font-display text-[1.4rem] font-bold leading-none">
                    {count > 0 ? count : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
