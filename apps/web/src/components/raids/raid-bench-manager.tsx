"use client";

import { RaidBenchManagerList } from "~/components/raids/raid-bench-manager-list";
import type { RaidParticipant, RaidParticipantCollection } from "~/server/api/interfaces/raid";
import { CharacterSelector } from "~/components/characters/character-selector";

export const RaidBenchManager = ({
  characters,
  onSelectAction,
  onRemoveAction,
}: {
  characters: RaidParticipantCollection;
  onSelectAction: (character: RaidParticipant) => void;
  onRemoveAction: (character: RaidParticipant) => void;
}) => {
  return (
    <div className="panel-surface rounded-2xl border border-border/70 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          Benched Characters
        </div>
        <CharacterSelector onSelectAction={onSelectAction} characterSet="all" />
      </div>
      <div className="mt-2.5">
        <RaidBenchManagerList characters={characters} onClickAction={onRemoveAction} />
      </div>
    </div>
  );
};
