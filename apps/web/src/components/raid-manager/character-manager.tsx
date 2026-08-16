"use client";

import { api } from "~/trpc/react";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { SortRaiders } from "~/lib/helpers";
import { CharacterManagerRow } from "~/components/raid-manager/character-manager-row";
import { CharacterManagerRowSkeleton } from "~/components/raid-manager/skeletons";
import { useEffect, useState } from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { SearchSyntaxTips } from "~/components/ui/search-syntax-tips";
import { matchesSearchQuery } from "~/lib/table-search";
import { useRouter, useSearchParams } from "next/navigation";

export function CharacterManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("s") ?? "";
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    const initialSearch = searchParams.get("s") ?? "";
    setSearchTerm(initialSearch);
  }, [searchParams]);

  // Debounced URL sync when searchTerm changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (searchTerm) {
      params.set("s", searchTerm);
    } else {
      params.delete("s");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const { data: characterData, isSuccess } = api.character.getCharactersWithSecondaries.useQuery();

  // Filter characters based on search term
  const filteredPlayers = characterData
    ? characterData.sort(SortRaiders).filter((player) => {
        const searchableText = [
          player.name,
          player.server,
          player.class,
          player.classDetail,
          ...player.secondaryCharacters.map((c) => c.name),
          ...player.secondaryCharacters.map((c) => c.class),
          player.isIgnored ? "ignored" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return matchesSearchQuery(searchableText, searchTerm);
      })
    : [];

  return (
    <div className="space-y-2">
      {/* Search Input - Fixed at top */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <TableSearchInput
            className="h-11"
            placeholder="Search mains, alts, class, or status..."
            defaultValue={initialSearch}
            onDebouncedChange={(v) => setSearchTerm(v ?? "")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          <div className="font-display flex h-11 items-center rounded-xl border border-border/80 bg-card/70 px-3.5 text-[13px] text-muted-foreground">
            {filteredPlayers.length} mains
          </div>
          <TableSearchTips>
            <p className="mb-1 font-medium">Search tips:</p>
            <ul className="mb-1 list-disc space-y-1 pl-4">
              <li>Search across primary and secondary character names/classes</li>
              <li>
                Includes status keywords like{" "}
                <span className="font-mono text-chart-3">ignored</span>
              </li>
            </ul>
            <SearchSyntaxTips />
          </TableSearchTips>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="panel-subtle max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden rounded-2xl border border-border/70">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 border-b border-border/70 bg-card/80 [&_tr]:border-b [&_tr]:border-border/70">
            <tr className="transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              <th className="font-display h-10 w-1/5 px-4 text-left align-middle text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Primary {characterData && ` (${filteredPlayers.length})`}
              </th>
              <th className="font-display h-10 w-3/5 px-2 text-left align-middle text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Secondary Characters
              </th>
              <th className="font-display h-10 w-1/5 px-2 text-left align-middle text-xs uppercase tracking-[0.16em] text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {isSuccess ? (
              <>
                {filteredPlayers?.sort(SortRaiders).map((character: RaidParticipant) => (
                  <CharacterManagerRow key={character.characterId} character={character} />
                ))}
              </>
            ) : (
              <CharacterManagerRowSkeleton />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
