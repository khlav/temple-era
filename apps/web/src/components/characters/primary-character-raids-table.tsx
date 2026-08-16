"use client";

import Link from "next/link";
import { AttendanceStatusIcon } from "~/components/ui/attendance-status-icon";
import { api } from "~/trpc/react";
import { PrettyPrintDate } from "~/lib/helpers";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { PrimaryCharacterRaidsTableRowSkeleton } from "~/components/characters/skeletons";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { SearchSyntaxTips } from "~/components/ui/search-syntax-tips";
import { matchesSearchQuery } from "~/lib/table-search";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { cn } from "~/lib/utils";

const GRID_COLS = "grid-cols-[minmax(0,1fr)_72px_44px]";

export function PrimaryCharacterRaidsTable({
  characterId,
  characterData,
}: {
  characterId: number;
  characterData: RaidParticipant;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get("s") ?? "";
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchTerms, setSearchTerms] = useState<string>(initialSearch);

  // Focus search input on component mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Update URL when search changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());

    if (searchTerms) {
      params.set("s", searchTerms);
    } else {
      params.delete("s");
    }

    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchTerms, router, searchParams]);

  // Only fetch raids if this is a primary character
  const { data: raids, isSuccess } = api.character.getRaidsForPrimaryCharacterId.useQuery(
    characterId,
    {
      enabled: characterData.isPrimary === true,
    },
  );

  // Filter raids based on search terms
  const filteredRaids = useMemo(() => {
    if (!raids || !searchTerms.trim()) {
      return raids;
    }

    return raids.filter((raid) => {
      const searchableString = [
        raid.name ?? "",
        raid.zone ?? "",
        PrettyPrintDate(new Date(raid.date), true),
        raid.attendanceWeight?.toString() ?? "",
        raid.attendeeOrBench ?? "",
        ...(raid.allCharacters?.map((c) => c.name ?? "") ?? []),
      ].join(" ");

      return matchesSearchQuery(searchableString, searchTerms);
    });
  }, [raids, searchTerms]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <TableSearchInput
            ref={searchInputRef}
            className="h-11"
            type="text"
            placeholder="Search this character's raids…"
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
              <li>Search by raid name, zone, date text, or character names</li>
            </ul>
            <SearchSyntaxTips />
          </TableSearchTips>
        </div>
      </div>

      <div className="panel-subtle overflow-hidden rounded-2xl border border-border/70">
        <div
          className={cn(
            "grid items-center gap-3 border-b border-border/70 bg-card/80 px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground",
            GRID_COLS,
          )}
        >
          <div>Raid history</div>
          <div className="text-right">Credit</div>
          <div className="text-center">Status</div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {isSuccess ? (
            filteredRaids && filteredRaids.length > 0 ? (
              filteredRaids.map((r) => (
                <div
                  key={r.raidId}
                  className={cn(
                    "grid items-center gap-3 border-b border-border/45 px-4 py-2.5 text-sm transition-colors hover:bg-accent/35",
                    GRID_COLS,
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        className="truncate text-secondary-foreground transition-all hover:text-primary"
                        target="_self"
                        href={"/raids/" + r.raidId}
                      >
                        {r.name}
                      </Link>
                      <ZoneBadge zoneName={r.zone} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {PrettyPrintDate(new Date(r.date), true)}
                    </div>
                  </div>
                  <div className="text-right">
                    <RaidAttendenceWeightBadge attendanceWeight={r.attendanceWeight} />
                  </div>
                  <div className="flex justify-center">
                    <AttendanceStatusIcon
                      status={r.attendeeOrBench as "attendee" | "bench" | null}
                      size={16}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No raids found matching your search
              </div>
            )
          ) : (
            <PrimaryCharacterRaidsTableRowSkeleton />
          )}
        </div>
        <div className="border-t border-border/55 px-4 py-2.5 text-xs text-muted-foreground">
          Only tracked raids count toward attendance restrictions.
        </div>
      </div>
    </div>
  );
}
