"use client";

import { api } from "~/trpc/react";
import React, { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ProfileEditorSkeleton } from "~/components/profile/skeletons";
import { Separator } from "~/components/ui/separator";
import { CharacterSelector } from "~/components/players/character-selector";
import { toastProfileSaved } from "~/components/profile/profile-toasts";
import { useToast } from "~/hooks/use-toast";
import { Loader } from "lucide-react";

interface Character {
  name: string | null;
  characterId: number | null;
}

export function ProfileEditor({ debug = false }: { debug?: boolean }) {
  const {toast} = useToast();
  const utils = api.useUtils();

  const [displayName, setDisplayName] = useState<string>("");
  const [character, setCharacter] = useState<Character>({
    name: null,
    characterId: null,
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
    },
  });
  useEffect(() => {
    if (isSuccess && profile) {
      setDisplayName(profile.name ?? "");
      setCharacter(profile.character ?? { name: null, characterId: null });
    }
  }, [isSuccess, profile]);

  const handleSave = () => {
    saveProfile.mutate({
      name: displayName ?? "",
      characterId: character?.characterId,
    })
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
          <div className="text-muted-foreground pt-1 text-center text-xs italic">
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
            />
            {error && (
              <div className="text-destructive mt-1 text-xs">{error}</div>
            )}
          </div>

          {/* Character ID */}
          <label htmlFor="display-name" className="text-sm font-medium">
            Primary character
          </label>
          <div className="flex flex-row gap-1">
            {character.characterId && (
              <div className="bg-muted rounded px-4 py-2">{character.name}</div>
            )}
            <div className="shrink">
              <CharacterSelector
                onSelectAction={handleCharacterChange}
                buttonContent={
                  character.characterId ? "Change" : "+ Add primary character"
                }
                characterSet="primaryOnly"
              />
            </div>
            {character.characterId && (
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground px-2 py-0 transition-all"
                onClick={() => setCharacter({ name: null, characterId: null })}
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
        <div className="bg-destructive text-destructive-foreground mt-4 max-w-sm overflow-x-auto whitespace-pre rounded p-2 lg:max-w-lg">
          <div className="font-bold">Debug: ON</div>
          <Separator className="bg-destructive-foreground my-2" />
          <div>{JSON.stringify(profile, null, 2)}</div>
        </div>
      )}
    </>
  );
}
