"use client";

import { CharacterDetail } from "~/components/characters/character-detail";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { useEffect } from "react";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

interface CharacterPageWrapperProps {
  characterId: number;
  characterData: RaidParticipant;
  showEditButton?: boolean;
  showRecipeEdit?: boolean;
  initialBreadcrumbData?: { [key: string]: string };
}

export function CharacterPageWrapper({
  characterId,
  characterData,
  showEditButton,
  showRecipeEdit,
  initialBreadcrumbData,
}: CharacterPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();

  // Set initial breadcrumb data from server
  useEffect(() => {
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    }
  }, [initialBreadcrumbData, updateBreadcrumbSegment]);

  return (
    <div className="w-full px-4">
      {characterId && characterData && (
        <>
          <CharacterDetail
            characterId={characterId}
            characterData={characterData}
            showEditButton={showEditButton}
            showRecipeEdit={showRecipeEdit}
          />
        </>
      )}
    </div>
  );
}
