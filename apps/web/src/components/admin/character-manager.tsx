"use client";

import { api } from "~/trpc/react";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
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

export function CharacterManager() {
  const {
    data: characterData,
    isSuccess,
  } = api.character.getCharactersWithSecondaries.useQuery();

  return (
    <div className="flex flex-col ">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/5">Primary</TableHead>
            <TableHead className="w-3/5">Secondary Characters</TableHead>
            <TableHead className="w-1/5"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {characterData
            ?.sort(SortRaiders)
            .map((character: RaidParticipant) => (
              <CharacterManagerRow
                key={character.characterId}
                character={character}
              />
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
