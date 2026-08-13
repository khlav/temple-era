"use client";

import { ClassIcon } from "~/components/ui/class-icon";

export interface WorldBuffCharacterFields {
  characterName: string;
  characterClass: string | null;
  primaryCharacterName: string | null;
}

/** Class icon + character name, with its primary's name (if it's an alt) deemphasized to the
 *  right. Shared between the queue columns and the scheduled-turn-ins section so linked
 *  characters look identical in both places. */
export function WorldBuffCharacterIdentity({ character }: { character: WorldBuffCharacterFields }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {character.characterClass && <ClassIcon characterClass={character.characterClass} px={18} />}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium">{character.characterName}</span>
        {character.primaryCharacterName && (
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {character.primaryCharacterName}
          </span>
        )}
      </div>
    </div>
  );
}
