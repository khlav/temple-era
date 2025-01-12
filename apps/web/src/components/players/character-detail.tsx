"use client";

import { api } from "~/trpc/react";
import Link from "next/link";
import { Separator } from "~/components/ui/separator";
import { PrimaryCharacterRaidsTable } from "~/components/players/primary-character-raids-table";
import anyAscii from "any-ascii";

export function CharacterDetail({ characterId }: { characterId: number }) {
  const { data: characterData, isSuccess } =
    api.character.getCharacterById.useQuery(characterId);

  return (
    <>
      {isSuccess && (
        <>
          <div className="flex flex-col">
            <div className="flex flex-row items-center">
              <div className="text-2xl font-bold">{characterData.name}</div>
              <div className="text-md text-muted-foreground pl-1">
                {characterData.class}
              </div>
            </div>
            {(characterData.secondaryCharacters ?? []).length ? (
              <>
                <Separator className="my-2 w-full" />
                <div className="flex flex-row gap-2">
                  <>
                    <div className="flex flex-wrap gap-2">
                      <div className="grow-0 py-2 text-sm">Alts:</div>
                      {(characterData.secondaryCharacters ?? [])
                        .sort((a, b) => (anyAscii(a.name) > anyAscii(b.name)) ? 1 : -1)
                        .map((secondaryCharacter) => (
                          <Link
                            key={secondaryCharacter.characterId}
                            href={`/players/${secondaryCharacter.characterId}`}
                            className="bg-secondary hover:text-primary rounded-xl px-4 py-2 text-sm hover:underline"
                          >
                            {secondaryCharacter.name}
                          </Link>
                        ))}
                    </div>
                  </>
                </div>
              </>
            ) : null}

            {characterData.isPrimary == false ? (
              <>
                <Separator className="my-2 w-full" />
                <div className="flex flex-row gap-2">
                  <>
                    <div className="flex flex-wrap gap-2">
                      <div className="grow-0 py-2 text-sm">
                        This is an alt for:
                      </div>
                      <Link
                        href={`/players/${characterData.primaryCharacterId}`}
                        className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm hover:underline"
                      >
                        {characterData.primaryCharacterName}
                      </Link>
                    </div>
                  </>
                </div>
              </>
            ) : null}

            <Separator className="my-2 w-full" />
            <div className="">
              {characterData.isPrimary ? (
                <div className="text-md text-muted-foreground">
                  <PrimaryCharacterRaidsTable characterId={characterId} />
                </div>
              ) : (
                <div className="text-md text-muted-foreground">
                  Raid reports are only available for primary characters.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
