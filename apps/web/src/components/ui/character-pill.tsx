"use client"

import { type MouseEventHandler } from "react";
import { ClassIcon } from "~/components/ui/class-icon";
import { RaidParticipant } from "~/server/api/interfaces/raid";
import { Button } from "~/components/ui/button";

export const CharacterPill = ({
    character
}: {
    character: RaidParticipant,
}) => (
    <Button
        id={character.characterId.toString()}
        variant="outline"
        size="sm"
        className="cursor-default bg-accent p-3 transition-all"
    >
        <div className="flex flex-row gap-1">
            <ClassIcon characterClass={character.class} px={16} />
            <div className="grow">{character.name}</div>
        </div>
    </Button>
);
