"use client";

import { api } from "~/trpc/react";
import type {
  RaidParticipant,
} from "~/server/api/interfaces/raid";
import {
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
} from "~/components/ui/table";
import { SortRaiders } from "~/lib/helpers";
import { CharacterManagerRow } from "~/components/raid-manager/character-manager-row";
import { CharacterManagerRowSkeleton } from "~/components/raid-manager/skeletons";
import {useEffect, useState} from "react";
import { Input } from "~/components/ui/input";
import {useRouter, useSearchParams} from "next/navigation";

export function CharacterManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    const initialSearch = searchParams.get("s") ?? "";
    setSearchTerm(initialSearch);
  }, [searchParams]);

  // Update the URL parameter when the search term changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);

    // Update the `s` URL parameter
    const params = new URLSearchParams(searchParams);
    if (newSearchTerm) {
      params.set("s", newSearchTerm);
    } else {
      params.delete("s");
    }
    router.replace(`?${params.toString()}`);
  };

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
          secondaryCharacterNames: player.secondaryCharacters.map((c)=> c.name),
          secondaryCharacterClasses: player.secondaryCharacters.map((c)=> c.class),
          isIgnored: player.isIgnored ? "ignored" : ""
        }).some((value) => {
          // Normalize and check if any field contains the search term
          return normalizeText(String(value)).includes(
            normalizeText(searchTerm),
          );
        });
      })
    : [];

  return (
    <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
      <Input
        placeholder="Search..."
        value={searchTerm}
        onChange={handleSearchChange}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/5">Primary {characterData && ` (${filteredPlayers.length})`}</TableHead>
            <TableHead className="w-3/5">Secondary Characters</TableHead>
            <TableHead className="w-1/5"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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
        </TableBody>
      </Table>
    </div>
  );
}
