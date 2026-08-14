"use client";

import { ClassIcon } from "~/components/ui/class-icon";
import { DiscordDmIcon } from "./queue-type-icon";

export interface WorldBuffCharacterFields {
  characterName: string;
  characterClass: string | null;
  primaryCharacterName: string | null;
  discordUserId?: string | null;
  discordUsername?: string | null;
}

/** Class icon + character name, with its primary's name (if it's an alt) deemphasized to the
 *  right, and — for worldbuff:manage viewers where a Discord identity resolved — the DM icon
 *  inline right after it. Shared between the queue columns and the scheduled-turn-ins section
 *  so linked characters look identical in both places. */
export function WorldBuffCharacterIdentity({
  character,
  showDiscord = false,
  dropped = false,
}: {
  character: WorldBuffCharacterFields;
  showDiscord?: boolean;
  /** Grays the class icon for an already-dropped row, matching `WorldBuffIcon`'s `grayscale`. */
  dropped?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {character.characterClass && (
        <ClassIcon
          characterClass={character.characterClass}
          px={18}
          className={dropped ? "grayscale" : undefined}
        />
      )}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium">{character.characterName}</span>
        {character.primaryCharacterName && (
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {character.primaryCharacterName}
          </span>
        )}
        {showDiscord && character.discordUserId && (
          <DiscordDmIcon
            discordUserId={character.discordUserId}
            discordUsername={character.discordUsername ?? null}
          />
        )}
      </div>
    </div>
  );
}
