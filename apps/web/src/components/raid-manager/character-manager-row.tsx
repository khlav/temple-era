"use client";

import { TableCell, TableRow } from "~/components/ui/table";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { Button } from "~/components/ui/button";
import React, { useState } from "react";
import { Loader, XIcon } from "lucide-react";
import { SortRaiders } from "~/lib/helpers";
import { CharacterSelector } from "~/components/characters/character-selector";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { toastCharacterSaved } from "~/components/raid-manager/raid-manager-toasts";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterPill } from "../ui/character-pill";
import { Tooltip, TooltipTrigger, TooltipContent } from "~/components/ui/tooltip";

export function CharacterManagerRow({
  character,
}: {
  character: RaidParticipant;
}) {
  const [inEditMode, setInEditMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [localSecondaryCharacters, setLocalSecondaryCharacters] =
    useState<RaidParticipantCollection>({});

  const utils = api.useUtils();
  const { toast } = useToast();

  // Add the updateIsIgnored mutation hook
  const updateIsIgnored = api.character.updateIsIgnored.useMutation({
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update ignore status.",
        variant: "destructive",
      });
      setIsSending(false);
    },
    onSuccess: async () => {
      await utils.invalidate(undefined, { refetchType: "all" });
      setIsSending(false);
    },
  });

  const updatePrimaryCharacterId =
    api.character.updatePrimaryCharacter.useMutation({
      onError: (error) => {
        alert(error.message);
        setIsSending(false);
      },
      onSuccess: async () => {
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
      secondaryCharacterIds: Object.keys(localSecondaryCharacters).map((cid) =>
        parseInt(cid),
      ),
    });
    setIsSending(true);
  };

  return (
    <>
      {!inEditMode ? (
        // View mode
        <TableRow key={character.characterId} className="group">
          <TableCell className="">
            <div className="flex flex-row gap-1">
              <ClassIcon characterClass={character.class} px={20} />
              <div className="grow">{character.name}</div>
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-row gap-2">
              {Object.values(character?.secondaryCharacters ?? {})
                .sort(SortRaiders)
                .map((character: RaidParticipant) => (
                  <div key={character.characterId} className="shrink">
                    <CharacterPill character={character}/>
                  </div>
                ))}
            </div>
          </TableCell>
          <TableCell className="text-right flex flex-row gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              className="border-2 border-primary opacity-0 group-hover:opacity-100"
              onClick={() => handleEditClick()}
            >
              Edit
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={character.isIgnored ? "default" : "secondary"}
                  size="sm"
                  className={
                    character.isIgnored
                      ? "border-2 border-primary"
                      : "border-2 border-primary opacity-0 group-hover:opacity-100"
                  }
                  disabled={isSending || updateIsIgnored.isPending}
                  onClick={() => {
                    setIsSending(true);
                    updateIsIgnored.mutate({
                      characterId: character.characterId,
                      isIgnored: !character.isIgnored,
                    });
                  }}
                >
                  {(isSending || updateIsIgnored.isPending) ? <Loader className="animate-spin" /> : character.isIgnored ? "Ignored" : "Ignore?"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="rounded bg-muted text-muted-foreground px-3 py-1 text-xs shadow transition-all">
                Removes this character from reports, recipes, and other UIs
              </TooltipContent>
            </Tooltip>
          </TableCell>
        </TableRow>
      ) : (
        // Edit mode
        <TableRow
          key={character.characterId}
          className="group bg-primary-foreground"
        >
          <TableCell className="font-bold">
            <div className="flex flex-row gap-1">
              <ClassIcon characterClass={character.class} px={20} />
              <div className="grow">{character.name}</div>
            </div>
          </TableCell>
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
                      <div className="flex flex-row gap-1">
                        <ClassIcon characterClass={character.class} px={16} />
                        <div className="grow">{character.name}</div>
                        <div className="grow-0">
                          <XIcon />
                        </div>
                      </div>
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
        </TableRow>
      )}
    </>
  );
}
