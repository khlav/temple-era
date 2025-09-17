"use client";

import { api } from "~/trpc/react";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { SortRaiders } from "~/lib/helpers";
import { CharacterManagerRow } from "~/components/raid-manager/character-manager-row";
import { CharacterManagerRowSkeleton } from "~/components/raid-manager/skeletons";
import { useEffect, useState } from "react";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { useRouter, useSearchParams } from "next/navigation";

export function CharacterManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    router.replace(`?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const { data: characterData, isSuccess } =
    api.character.getCharactersWithSecondaries.useQuery();

  // Function to normalize text (remove non-ASCII characters and convert to lowercase)
  const normalizeText = (text: string) => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^\x00-\x7F]/g, "") // Remove non-ASCII characters
      .toLowerCase(); // Convert to lowercase
  };

  // Filter characters based on search term
  const filteredPlayers = characterData
    ? characterData.sort(SortRaiders).filter((player) => {
        return Object.values({
          ...player,
          secondaryCharacterNames: player.secondaryCharacters.map(
            (c) => c.name,
          ),
          secondaryCharacterClasses: player.secondaryCharacters.map(
            (c) => c.class,
          ),
          isIgnored: player.isIgnored ? "ignored" : "",
        }).some((value) => {
          // Normalize and check if any field contains the search term
          return normalizeText(String(value)).includes(
            normalizeText(searchTerm),
          );
        });
      })
    : [];

  return (
    <div className="space-y-2">
      {/* Search Input - Fixed at top */}
      <div className="space-y-1">
        <TableSearchInput
          placeholder="Search..."
          initialValue={searchParams.get("s") ?? ""}
          onDebouncedChange={(v) => setSearchTerm(v)}
        />
        <TableSearchTips>
          <p className="mb-1 font-medium">Search tips:</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Search across primary and secondary character names/classes</li>
            <li>
              Includes status keywords like{" "}
              <span className="font-mono text-chart-3">ignored</span>
            </li>
          </ul>
        </TableSearchTips>
      </div>

      {/* Scrollable content area */}
      <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
        <div className="relative w-full">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 border-b bg-background [&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-10 w-1/5 px-2 text-left align-middle font-medium text-muted-foreground">
                  Primary {characterData && ` (${filteredPlayers.length})`}
                </th>
                <th className="h-10 w-3/5 px-2 text-left align-middle font-medium text-muted-foreground">
                  Secondary Characters
                </th>
                <th className="h-10 w-1/5 px-2 text-left align-middle font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {isSuccess ? (
                <>
                  {filteredPlayers
                    ?.sort(SortRaiders)
                    .map((character: RaidParticipant) => (
                      <CharacterManagerRow
                        key={character.characterId}
                        character={character}
                      />
                    ))}
                </>
              ) : (
                <CharacterManagerRowSkeleton />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
