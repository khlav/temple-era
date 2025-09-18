"use client";

import { CharacterDetail } from "~/components/characters/character-detail";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface CharacterPageWrapperProps {
  characterId: number;
  showEditButton?: boolean;
  showRecipeEdit?: boolean;
}

export function CharacterPageWrapper({
  characterId,
  showEditButton,
  showRecipeEdit,
}: CharacterPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: characterData, isSuccess } =
    api.character.getCharacterById.useQuery(characterId);

  useEffect(() => {
    if (isSuccess && characterData) {
      // Update breadcrumb with character name
      updateBreadcrumbSegment(characterId.toString(), characterData.name);
    }
  }, [isSuccess, characterData, characterId, updateBreadcrumbSegment]);

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
