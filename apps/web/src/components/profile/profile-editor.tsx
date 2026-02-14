"use client";

import { api } from "~/trpc/react";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ProfileEditorSkeleton } from "~/components/profile/skeletons";
import { Separator } from "~/components/ui/separator";
import { CharacterSelector } from "~/components/characters/character-selector";
import { Check, X, ArrowLeft } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";

interface Character {
  name: string | null;
  characterId: number | null;
  class: string | null;
}

export function ProfileEditor({ debug = false }: { debug?: boolean }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [displayName, setDisplayName] = useState<string>("");
  const [character, setCharacter] = useState<Character>({
    name: null,
    characterId: null,
    class: null,
  });

  // Inline editing state for name
  const [tempName, setTempName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const latestCharacterRef = useRef<Character | null>(null);

  const { data: profile, isLoading } = api.profile.getMyProfile.useQuery();

  // Sync state with profile data
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.name ?? "");
      setTempName(profile.name ?? "");
      setCharacter(
        profile.character ?? { name: null, characterId: null, class: null },
      );
    }
  }, [profile]);

  const saveProfile = api.profile.saveMyProfile.useMutation({
    onMutate: async (newProfile) => {
      // Cancel outgoing refetches
      await utils.profile.getMyProfile.cancel();

      // Snapshot previous value
      const previousProfile = utils.profile.getMyProfile.getData();

      // Optimistically update
      utils.profile.getMyProfile.setData(undefined, (old) => {
        if (!old) return old;
        const newCharId = newProfile.characterId;

        // Construct optimistic character object
        let optimisticCharacter = old.character;
        if (newCharId !== undefined) {
          if (newCharId === null) {
            // Explicitly cleared
            optimisticCharacter = null;
          } else if (
            latestCharacterRef.current &&
            latestCharacterRef.current.characterId === newCharId
          ) {
            // We have the details from the selection

            optimisticCharacter = latestCharacterRef.current as any;
          }
        }

        return {
          ...old,
          name: newProfile.name ?? old.name,
          characterId: newProfile.characterId ?? old.characterId,
          character: optimisticCharacter,
        } as any;
      });

      return { previousProfile };
    },
    onError: (err, newProfile, context) => {
      // Rollback
      if (context?.previousProfile) {
        utils.profile.getMyProfile.setData(undefined, context.previousProfile);
      }
      console.error("Failed to save profile", err);
    },
    onSettled: () => {
      void utils.profile.getMyProfile.invalidate();
    },
  });

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (!trimmed || trimmed.length < 3) return; // Basic validation

    setDisplayName(trimmed); // Update local state immediately

    saveProfile.mutate({
      name: trimmed,
      characterId: character.characterId,
    });
  };

  const handleCancelNameEdit = () => {
    setTempName(displayName);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      handleCancelNameEdit();
    }
  };

  const handleCharacterChange = (newCharacter: Character) => {
    // Update local state immediately
    setCharacter(newCharacter);
    latestCharacterRef.current = newCharacter;

    // Auto-save
    saveProfile.mutate({
      name: displayName,
      characterId: newCharacter.characterId,
    });
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
            <div className="flex items-center gap-2">
              <Input
                ref={nameInputRef}
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                className="w-60"
                disabled={saveProfile.isPending}
              />
              {tempName !== displayName && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                    onClick={handleSaveName}
                    disabled={saveProfile.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={handleCancelNameEdit}
                    disabled={saveProfile.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Character ID */}
          <label className="text-sm font-medium">Primary character</label>
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
                disabled={saveProfile.isPending}
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
                disabled={saveProfile.isPending}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Back Button */}
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>
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
