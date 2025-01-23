"use client";

import { TableCell, TableRow } from "~/components/ui/table";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { Button } from "~/components/ui/button";
import React, { useEffect, useState } from "react";
import {Loader, XIcon} from "lucide-react";
import { SortRaiders } from "~/lib/helpers";
import { CharacterSelector } from "~/components/players/character-selector";
import { api } from "~/trpc/react";
import { toastRaidSaved } from "~/components/raids/raid-toasts";
import { useToast } from "~/hooks/use-toast";
import {toastCharacterSaved} from "~/components/admin/admin-toasts";

export function CharacterManagerRow({
  character,
}: {
  character: RaidParticipant;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [inEditMode, setInEditMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [localSecondaryCharacters, setLocalSecondaryCharacters] =
    useState<RaidParticipantCollection>({});

  const utils = api.useUtils();
  const { toast } = useToast();

  const updatePrimaryCharacterId =
    api.character.updatePrimaryCharacter.useMutation({
      onError: (error) => {
        alert(error.message);
        setIsSending(false);
      },
      onSuccess: async (result) => {
        await utils.invalidate(undefined, { refetchType: "all" });
        toastCharacterSaved(toast, character, localSecondaryCharacters);
        setIsSending(false);
        setInEditMode(false);
      },
    });

  const convertCharacterListToCollection = (
    characterList: RaidParticipant[],
  ) => {
    return characterList.reduce((acc, rel) => {
      acc[rel.characterId] = rel;
      return acc;
    }, {} as RaidParticipantCollection);
  };

  const originalSecondaryCharacters = convertCharacterListToCollection(
    character.secondaryCharacters ?? [],
  );

  const handleRemoveCharacter = (characterId: string) => {
    const newCharacterList = { ...localSecondaryCharacters };
    delete newCharacterList[characterId];
    setLocalSecondaryCharacters(newCharacterList);
    // console.log(localSecondaryCharacters);
  };

  const handleAddCharacter = (character: RaidParticipant) => {
    console.log(character);
    const newCharacterList = {
      ...localSecondaryCharacters,
      [character.characterId]: character,
    };
    setLocalSecondaryCharacters(newCharacterList);
  };

  const handleEditClick = () => {
    setLocalSecondaryCharacters(originalSecondaryCharacters);
    setInEditMode(true);
  };

  const handleCancelClick = () => {
    setInEditMode(false);
    setLocalSecondaryCharacters(originalSecondaryCharacters ?? {});
  };

  const handleSaveClick = () => {
    updatePrimaryCharacterId.mutate({
        primaryCharacterId: character.characterId ?? 0,
        secondaryCharacterIds: Object.keys(localSecondaryCharacters).map((cid) => parseInt(cid)),
      }
    );
    setIsSending(true);
  };

  useEffect(() => {
    if (!isLoaded) {
      setLocalSecondaryCharacters(originalSecondaryCharacters);
      setIsLoaded(true);
    }
  }, [originalSecondaryCharacters, isLoaded, localSecondaryCharacters]);

  return (
    <TableRow key={character.characterId} className="group">
      {!inEditMode ? (
        // View mode
        <>
          <TableCell className="">{character.name}</TableCell>
          <TableCell>
            <div className="flex flex-row gap-2">
              {Object.values(character?.secondaryCharacters ?? {})
                .sort(SortRaiders)
                .map((character: RaidParticipant) => (
                  <div key={character.characterId} className="shrink">
                    <Button
                      id={character.characterId.toString()}
                      variant="outline"
                      size="sm"
                      className="cursor-default bg-accent p-3 transition-all"
                    >
                      {character.name}
                    </Button>
                  </div>
                ))}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <Button
              variant="secondary"
              size="sm"
              className="opacity-0 group-hover:opacity-100 border-primary border-2"
              onClick={() => handleEditClick()}
            >
              Edit
            </Button>
          </TableCell>
        </>
      ) : (
        // Edit mode
        <>
          <TableCell className="font-bold">{character.name}</TableCell>
          <TableCell className="">
            <div className="flex flex-row gap-2">
              {(Object.values(localSecondaryCharacters) ?? [])
                .sort(SortRaiders)
                .map((character: RaidParticipant) => (
                  <div key={character.characterId} className="shrink">
                    <Button
                      id={character.characterId.toString()}
                      variant="outline"
                      size="sm"
                      className={
                        "bg-accent p-3 transition-all hover:bg-destructive " +
                        (Object.keys(
                          originalSecondaryCharacters ?? {},
                        ).includes(character.characterId.toString())
                          ? ""
                          : "border-primary")
                      }
                      onClick={(e) => handleRemoveCharacter(e.currentTarget.id)}
                    >
                      {character.name}
                      <XIcon />
                    </Button>
                  </div>
                ))}
              <div className="shrink">
                <CharacterSelector
                  onSelectAction={handleAddCharacter}
                  characterSet="secondaryEligible"
                />
              </div>
            </div>
          </TableCell>
          <TableCell className="flex flex-row flex-nowrap text-right">
            <div className="grow" />
            <Button
              variant="outline"
              size="sm"
              className="mr-1 shrink"
              disabled={isSending}
              onClick={() => handleCancelClick()}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              className="shrink"
              disabled={isSending}
              onClick={() => handleSaveClick()}
            >
              {isSending ? <Loader className="animate-spin" /> : "Save"}
            </Button>
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
