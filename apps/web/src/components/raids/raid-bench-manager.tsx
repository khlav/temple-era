"use client"

import { RaidBenchManagerList } from "~/components/raids/raid-bench-manager-list";
import type {RaidParticipant, RaidParticipantCollection} from "~/server/api/interfaces/raid";
import {CharacterSelector} from "~/components/players/character-selector";

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
    <>
      <div className="flex gap-2 pb-1">
        <CharacterSelector onSelectAction={onSelectAction} characterSet="all" />
      </div>
      <RaidBenchManagerList characters={characters} onClickAction={onRemoveAction} />
    </>
  );
};
