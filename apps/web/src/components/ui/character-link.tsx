import Link from "next/link";
import { ClassIcon } from "./class-icon";

interface CharacterLinkProps {
  characterId: number;
  characterName: string;
  characterClass: string;
  primaryCharacterName?: string | null;
  iconSize?: number;
  target?: "_blank" | "_self";
  className?: string;
}

/**
 * Reusable component for displaying a character as a link with class icon
 * Matches the pattern used in character tables throughout the app
 */
export function CharacterLink({
  characterId,
  characterName,
  characterClass,
  primaryCharacterName,
  iconSize = 20,
  target = "_self",
  className,
}: CharacterLinkProps) {
  // Match the format from characters-table.tsx:
  // - characterName is the main display
  // - primaryCharacterName (if exists) is shown in smaller muted text next to it (no parentheses)
  return (
    <Link
      className={`group flex w-full flex-row items-center transition-all hover:text-primary ${className ?? ""}`}
      target={target}
      href={`/characters/${characterId}`}
    >
      <ClassIcon
        characterClass={characterClass.toLowerCase()}
        px={iconSize}
        className="mr-1 grow-0"
      />
      <div className="flex min-w-0 items-baseline gap-1.5">
        <div className="truncate">{characterName}</div>
        {primaryCharacterName ? (
          <div className="truncate text-xs font-normal text-muted-foreground">
            {primaryCharacterName}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
