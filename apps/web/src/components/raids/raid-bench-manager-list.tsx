"use client";

import type { RaidParticipant, RaidParticipantCollection } from "~/server/api/interfaces/raid";
import { Button } from "~/components/ui/button";
import { XIcon } from "lucide-react";

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
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  if (characterList.length === 0) {
    return <div className="text-sm text-muted-foreground">No benched characters.</div>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {characterList.map((character) => (
        <Button
          key={character.characterId}
          id={character.characterId.toString()}
          variant="outline"
          size="sm"
          className="bg-accent/70 transition-colors hover:bg-destructive hover:text-destructive-foreground"
          onClick={(e) => handleRemoveClick(e.currentTarget.id)}
        >
          {character.name}
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  );
}
