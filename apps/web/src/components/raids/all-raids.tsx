"use client";

import { api } from "~/trpc/react";
import { RaidsTable } from "~/components/raids/raids-table";
import { RaidsTableSkeleton } from "~/components/raids/skeletons";
import type { Session } from "next-auth";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { SearchSyntaxTips } from "~/components/ui/search-syntax-tips";
import { matchesSearchQuery } from "~/lib/table-search";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PrettyPrintDate } from "~/lib/helpers";
import type { Raid } from "~/server/api/interfaces/raid";
import { getInstanceIdForZoneName, ZONE_ACTIVE_ACCENT_CLASSES } from "~/lib/raid-zones";
import { FilterRail, type FilterRailItem } from "~/components/ui/filter-rail";

const ZONE_RAIL_ORDER: { id: string; label: string; accentClassName: string }[] = [
  { id: "naxxramas", label: "Naxxramas", accentClassName: "text-zone-naxx-text" },
  { id: "aq40", label: "Temple of AQ", accentClassName: "text-zone-aq40-text" },
  { id: "bwl", label: "Blackwing Lair", accentClassName: "text-zone-bwl-text" },
  { id: "mc", label: "Molten Core", accentClassName: "text-zone-mc-text" },
  { id: "zg", label: "Zul'Gurub", accentClassName: "text-zone-zg-text" },
  { id: "onyxia", label: "Onyxia", accentClassName: "text-zone-ony-text" },
  { id: "aq20", label: "Ruins of AQ", accentClassName: "text-zone-aq20-text" },
];

export function AllRaids({
  session,
  raids: initialRaids,
}: {
  session?: Session;
  raids?: Raid[] | null;
}) {
  const { data: fetchedRaids, isLoading } = api.raid.getRaids.useQuery(undefined, {
    enabled: !initialRaids,
  });
  const raids = initialRaids ?? fetchedRaids;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get("s") ?? "";
  const [searchTerms, setSearchTerms] = useState<string>(initialSearch);
  // OR filter across zones, matching the dashboard's zone-tile filtering — empty means "all".
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());
  const toggleZone = (id: string) => {
    if (id === "all") {
      setSelectedZoneIds(new Set());
      return;
    }
    setSelectedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Debounced URL sync handled by TableSearchInput via onDebouncedChange updating state
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());
    if (searchTerms) {
      params.set("s", searchTerms);
    } else {
      params.delete("s");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerms]);

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let untagged = 0;
    for (const r of raids ?? []) {
      const zoneId = getInstanceIdForZoneName(r.zone);
      if (zoneId) counts[zoneId] = (counts[zoneId] ?? 0) + 1;
      else untagged += 1;
    }
    return { counts, untagged };
  }, [raids]);

  const railItems: FilterRailItem[] = useMemo(() => {
    const items: FilterRailItem[] = [
      { id: "all", label: "All raids", count: raids?.length ?? 0, accentClassName: "text-primary" },
      ...ZONE_RAIL_ORDER.map((zone) => ({
        id: zone.id,
        label: zone.label,
        count: zoneCounts.counts[zone.id] ?? 0,
        accentClassName: zone.accentClassName,
        activeClassName: ZONE_ACTIVE_ACCENT_CLASSES[zone.id],
      })),
    ];
    if (zoneCounts.untagged > 0) {
      items.push({
        id: "untagged",
        label: "Unknown / Untagged",
        count: zoneCounts.untagged,
        accentClassName: "text-muted-foreground",
        activeClassName: "text-muted-foreground border-muted-foreground/60 bg-muted-foreground/10",
      });
    }
    return items;
  }, [raids, zoneCounts]);

  // "All raids" isn't a real filter value — it's the display form of "nothing selected",
  // shown active whenever the OR-set is empty so FilterRail's generic isActive check works.
  const railActiveIds = useMemo(
    () => (selectedZoneIds.size === 0 ? new Set(["all"]) : selectedZoneIds),
    [selectedZoneIds],
  );

  const zoneFilteredRaids = useMemo(() => {
    if (!raids || selectedZoneIds.size === 0) return raids;
    return raids.filter((r) => {
      const zoneId = getInstanceIdForZoneName(r.zone);
      if (!zoneId) return selectedZoneIds.has("untagged");
      return selectedZoneIds.has(zoneId);
    });
  }, [raids, selectedZoneIds]);

  const filteredRaids = useMemo(() => {
    if (!zoneFilteredRaids || !searchTerms.trim()) return zoneFilteredRaids;
    return zoneFilteredRaids.filter((r) => {
      const searchable = [
        r.name ?? "",
        r.zone ?? "",
        PrettyPrintDate(new Date(r.date), true),
        r.creator?.name ?? "",
      ].join(" ");
      return matchesSearchQuery(searchable, searchTerms);
    });
  }, [zoneFilteredRaids, searchTerms]);

  // Show loading skeleton only if we don't have initial data AND the query is loading
  const isActuallyLoading = !initialRaids && isLoading;
  // Show content if we have data (either from server or client fetch)
  const hasData = !!raids;

  return (
    <>
      {isActuallyLoading || !hasData ? (
        <RaidsTableSkeleton rows={10} />
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <FilterRail
            heading="Filter by zone"
            items={railItems}
            activeIds={railActiveIds}
            onToggle={toggleZone}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <TableSearchInput
                  className="h-11"
                  placeholder="Search raids by name, zone, date, creator..."
                  defaultValue={initialSearch}
                  onDebouncedChange={(v) => setSearchTerms(v ?? "")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
                <div className="font-display flex h-11 items-center rounded-xl border border-border/80 bg-card/70 px-3.5 text-[13px] text-muted-foreground">
                  {filteredRaids?.length ?? 0} raids
                </div>
                <TableSearchTips>
                  <p className="mb-1 font-medium">Search tips:</p>
                  <ul className="mb-1 list-disc space-y-1 pl-4">
                    <li>Search by raid name, zone, date text, or creator name</li>
                  </ul>
                  <SearchSyntaxTips />
                </TableSearchTips>
              </div>
            </div>
            <RaidsTable raids={filteredRaids} session={session} />
          </div>
        </div>
      )}
    </>
  );
}
