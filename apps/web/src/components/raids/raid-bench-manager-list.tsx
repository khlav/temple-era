"use client";

import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { Button } from "~/components/ui/button";
import { XIcon } from "lucide-react";
import anyAscii from "any-ascii";

export function RaidBenchManagerList({
  characters,
  onClickAction,
}: {
  characters: RaidParticipantCollection;
  onClickAction: (character: RaidParticipant) => void;
}) {
  const handleRemoveClick = (characterId: string) => {
    // @ts-expect-error Suppress undefined concern.  Select cannot happen without a proper value.
    return onClickAction(characters[characterId]);
  };

  const characterList = Object.values(characters).sort((a, b) =>
    anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
  );

  return (
    <div className="flex flex-wrap gap-1">
      {characterList.map((character) => (
        <div key={character.characterId} className="group shrink">
          <Button
            id={character.characterId.toString()}
            variant="outline"
            className="bg-accent p-3 pl-5 transition-all hover:bg-destructive"
            onClick={(e) => handleRemoveClick(e.currentTarget.id)}
          >
            {character.name}
            <span className="w-0 overflow-hidden transition-all duration-200 group-hover:w-4">
              <XIcon />
            </span>
          </Button>
        </div>
      ))}
    </div>
  );
}
