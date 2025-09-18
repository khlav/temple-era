"use client";

import { CharacterDetail } from "~/components/characters/character-detail";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface CharacterPageWrapperProps {
  characterId: number;
  showEditButton?: boolean;
  showRecipeEdit?: boolean;
  initialBreadcrumbData?: { [key: string]: string };
}

export function CharacterPageWrapper({
  characterId,
  showEditButton,
  showRecipeEdit,
  initialBreadcrumbData,
}: CharacterPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: characterData, isSuccess } =
    api.character.getCharacterById.useQuery(characterId);

  // Set initial breadcrumb data from server
  useEffect(() => {
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    }
  }, [initialBreadcrumbData, updateBreadcrumbSegment]);

  useEffect(() => {
    if (isSuccess && characterData) {
      // Update breadcrumb with character name (only if not already set by server)
      if (!initialBreadcrumbData?.[characterId.toString()]) {
        updateBreadcrumbSegment(characterId.toString(), characterData.name);
      }
    }
  }, [
    isSuccess,
    characterData,
    characterId,
    updateBreadcrumbSegment,
    initialBreadcrumbData,
  ]);

  return (
    <div className="w-full px-4">
      {characterId && (
        <>
          <CharacterDetail
            characterId={characterId}
            showEditButton={showEditButton}
            showRecipeEdit={showRecipeEdit}
          />
        </>
      )}
    </div>
  );
}
