"use client"

import { RaidBenchManagerCharacterSelector } from "~/components/raids/raid-bench-manager-character-selector";
import { RaidBenchManagerList } from "~/components/raids/raid-bench-manager-list";
import {RaidParticipant, RaidParticipantCollection} from "~/server/api/interfaces/raid";

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
      <RaidBenchManagerList characters={characters} onClickAction={onRemoveAction} />
      <div className="flex gap-2 pt-1">
        <RaidBenchManagerCharacterSelector onSelectAction={onSelectAction} />
      </div>
    </>
  );
};
