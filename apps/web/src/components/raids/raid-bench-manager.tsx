"use client";

import { RaidBenchManagerList } from "~/components/raids/raid-bench-manager-list";
import type { RaidParticipant, RaidParticipantCollection } from "~/server/api/interfaces/raid";
import { CharacterSelector } from "~/components/characters/character-selector";
import { SidebarCard } from "~/components/raids/raid-detail-base";

export const RaidBenchManager = ({
  characters,
  onSelectAction,
  onRemoveAction,
}: {
  characters: RaidParticipantCollection;
  onSelectAction: (character: RaidParticipant) => void;
  onRemoveAction: (character: RaidParticipant) => void;
}) => {
  const count = Object.keys(characters).length;

  return (
    <SidebarCard
      title={`Bench${count > 0 ? ` · ${count}` : ""}`}
      action={<CharacterSelector onSelectAction={onSelectAction} characterSet="all" />}
    >
      <RaidBenchManagerList characters={characters} onClickAction={onRemoveAction} />
      <p className="mt-3 text-xs text-muted-foreground">
        Characters available for the raid but absent from the logs — a full raid, or a swap. They
        earn the same credit as attendees.
      </p>
    </SidebarCard>
  );
};
