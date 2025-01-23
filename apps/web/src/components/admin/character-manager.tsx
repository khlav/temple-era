"use client";

import { api } from "~/trpc/react";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import {
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import { SortRaiders } from "~/lib/helpers";
import { CharacterManagerRow } from "~/components/admin/character-manager-row";
import { CharacterManagerRowSkeleton } from "~/components/admin/skeletons";
import { useState } from "react";
import { Input } from "~/components/ui/input";

export function CharacterManager() {
  const [searchTerm, setSearchTerm] = useState<string>("");

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
          secondaryCharacterNames: player.secondaryCharacters.map((c)=> c.name)
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
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/5">Primary</TableHead>
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
