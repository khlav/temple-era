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
import { Badge } from "~/components/ui/badge";

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

  const filteredRaids = useMemo(() => {
    if (!raids || !searchTerms.trim()) return raids;
    return raids.filter((r) => {
      const searchable = [
        r.name ?? "",
        r.zone ?? "",
        PrettyPrintDate(new Date(r.date), true),
        r.creator?.name ?? "",
      ].join(" ");
      return matchesSearchQuery(searchable, searchTerms);
    });
  }, [raids, searchTerms]);

  // Show loading skeleton only if we don't have initial data AND the query is loading
  const isActuallyLoading = !initialRaids && isLoading;
  // Show content if we have data (either from server or client fetch)
  const hasData = !!raids;

  return (
    <>
      {isActuallyLoading || !hasData ? (
        <RaidsTableSkeleton rows={10} />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <TableSearchInput
                placeholder="Search raids by name, zone, date, creator..."
                defaultValue={initialSearch}
                onDebouncedChange={(v) => setSearchTerms(v ?? "")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <Badge variant="secondary">{filteredRaids?.length ?? 0} raids</Badge>
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
      )}
    </>
  );
}
