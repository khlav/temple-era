"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { ClassIcon } from "~/components/ui/class-icon";

interface CrafterListProps {
  characters: Array<{
    characterId: number;
    name: string;
    isActiveRaider: boolean;
    class?: string;
  }>;
  showInactiveCharacters: boolean;
  maxVisible?: number;
}

export function CrafterList({
  characters,
  showInactiveCharacters,
  maxVisible = 5,
}: CrafterListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleCharacters = isExpanded ? characters : characters.slice(0, maxVisible);
  const remainingCount = Math.max(0, characters.length - maxVisible);

  return (
    <div className="my-auto flex flex-wrap gap-1">
      {visibleCharacters.map((character) => (
        <Link
          key={character.characterId}
          href={`/characters/${character.characterId}`}
          className={`inline-flex items-center gap-1.5 rounded-md bg-secondary py-1 pl-1 pr-2 text-xs text-secondary-foreground transition-all duration-100 hover:text-primary ${
            !character.isActiveRaider && showInactiveCharacters ? "opacity-40" : "opacity-80"
          }`}
        >
          {character.class ? (
            <ClassIcon characterClass={character.class} px={16} className="shrink-0 rounded-sm" />
          ) : null}
          {character.name}
        </Link>
      ))}
      {!isExpanded && remainingCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setIsExpanded(true)}
        >
          + {remainingCount} more
        </Button>
      ) : null}
      {isExpanded && remainingCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setIsExpanded(false)}
        >
          Show less
        </Button>
      ) : null}
    </div>
  );
}
