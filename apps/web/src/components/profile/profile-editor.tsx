"use client";

import { api } from "~/trpc/react";
import React, { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ProfileEditorSkeleton } from "~/components/profile/skeletons";
import { Separator } from "~/components/ui/separator";
import { CharacterSelector } from "~/components/characters/character-selector";
import { toastProfileSaved } from "~/components/profile/profile-toasts";
import { useToast } from "~/hooks/use-toast";
import { Loader } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";

interface Character {
  name: string | null;
  characterId: number | null;
  class: string | null;
}

export function ProfileEditor({ debug = false }: { debug?: boolean }) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const [displayName, setDisplayName] = useState<string>("");
  const [character, setCharacter] = useState<Character>({
    name: null,
    characterId: null,
    class: null,
  });
  const [isChanged, setIsChanged] = useState<boolean>(false);
  const [error, setError] = useState("");
  const [sendingData, setSendingData] = useState<boolean>(false);

  const {
    data: profile,
    isLoading,
    isSuccess,
  } = api.profile.getMyProfile.useQuery();

  const saveProfile = api.profile.saveMyProfile.useMutation({
    onError: (error) => {
      alert(error.message);
      setSendingData(false);
    },
    onSuccess: async (result) => {
      console.log(result);
      toastProfileSaved(toast);
      await utils.invalidate(undefined, { refetchType: "all" });
      setSendingData(false);
      setIsChanged(false);
    },
  });

  useEffect(() => {
    if (isSuccess && profile) {
      setDisplayName(profile.name ?? "");
      setCharacter(
        profile.character ?? { name: null, characterId: null, class: null },
      );
    }
  }, [isSuccess, profile]);

  const handleSave = () => {
    setSendingData(true);
    saveProfile.mutate({
      name: displayName ?? "",
      characterId: character?.characterId,
    });
  };

  const handleDisplayNameChange = (newDisplayName: string) => {
    if (!profile) return; // early return if profile is undefined
    setDisplayName(newDisplayName);
    validateDisplayName(newDisplayName);
    setIsChanged(
      newDisplayName !== profile.name ||
        character.characterId !== (profile.characterId ?? -1),
    );
  };

  const handleCharacterChange = (newCharacter: Character) => {
    if (!profile) return; // early return if profile is undefined
    setCharacter(newCharacter);
    setIsChanged(
      displayName !== profile.name ||
        newCharacter.characterId !== (profile.characterId ?? -1),
    );
  };

  const validateDisplayName = (name: string) => {
    if (name.length < 3) {
      setError("Display Name must be at least 3 characters long.");
    } else {
      setError("");
    }
  };

  if (isLoading) {
    return <ProfileEditorSkeleton />;
  }

  return (
    <>
      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* Profile Avatar */}
        <div className="mx-auto flex-col pt-4 md:mx-0">
          <Avatar className="h-24 w-24">
            <AvatarImage src={profile?.image ?? ""} alt={profile?.name ?? ""} />
            <AvatarFallback>
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="pt-1 text-center text-xs italic text-muted-foreground">
            Source: Discord
          </div>
        </div>

        {/* Editable Fields */}
        <div className="flex w-full flex-col gap-4 md:w-auto">
          {/* Display Name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="display-name" className="text-sm font-medium">
              Display Name
            </label>
            <Input
              id="display-name"
              value={displayName}
              className="w-60"
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              disabled={sendingData}
            />
            {error && (
              <div className="mt-1 text-xs text-destructive">{error}</div>
            )}
          </div>

          {/* Character ID */}
          <label htmlFor="display-name" className="text-sm font-medium">
            Primary character
          </label>
          <div className="flex flex-row gap-1">
            {character.characterId && (
              <div className="flex flex-row gap-1 rounded bg-muted px-4 py-2">
                <ClassIcon
                  characterClass={character.class ?? "Unknown"}
                  px={20}
                />
                <div className="grow text-sm">{character.name}</div>
              </div>
            )}
            <div className="shrink">
              <CharacterSelector
                onSelectAction={handleCharacterChange}
                buttonContent={
                  character.characterId ? "Change" : "+ Add primary character"
                }
                characterSet="primary"
                disabled={sendingData}
              />
            </div>
            {character.characterId && (
              <Button
                variant="outline"
                size="sm"
                className="px-2 py-0 text-muted-foreground transition-all hover:bg-destructive hover:text-destructive-foreground"
                onClick={() =>
                  handleCharacterChange({
                    name: null,
                    characterId: null,
                    class: null,
                  })
                }
                disabled={sendingData}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={!isChanged || !!error || sendingData}
            className="wfull mt-2 md:w-40"
          >
            {sendingData ? <Loader className="animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
      {debug && (
        <div className="mt-4 max-w-sm overflow-x-auto whitespace-pre rounded bg-destructive p-2 text-destructive-foreground lg:max-w-lg">
          <div className="font-bold">Debug: ON</div>
          <Separator className="my-2 bg-destructive-foreground" />
          <div>{JSON.stringify(profile, null, 2)}</div>
        </div>
      )}
    </>
  );
}
