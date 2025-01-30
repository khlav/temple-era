"use client";

import { api } from "~/trpc/react";
import Link from "next/link";
import { Separator } from "~/components/ui/separator";
import { PrimaryCharacterRaidsTable } from "~/components/players/primary-character-raids-table";
import anyAscii from "any-ascii";
import {Button} from "~/components/ui/button";
import {Edit} from "lucide-react";
import React from "react";
import {ClassIcon} from "~/components/ui/class-icon";

export function CharacterDetail({ characterId, showEditButton }: { characterId: number, showEditButton?: boolean }) {
  const { data: characterData, isSuccess } =
    api.character.getCharacterById.useQuery(characterId);

  return (
    <>
      {isSuccess && (
        <>
          <div className="flex flex-col">
            <div className="flex flex-row items-center gap-1">
              <div className="grow-0">
                <ClassIcon characterClass={characterData.class.toLowerCase()} px={32} />
              </div>
              <div className="grow text-2xl font-bold">
                {characterData.name}
              </div>
              {showEditButton && (
                <div className="grow-0 align-text-top">
                  <Link href={`/admin/character-manager?s=${characterData.name}`}>
                    <Button className="py-5">
                      <Edit />
                      Assign main vs. alts
                    </Button>
                  </Link>
                </div>
              )}
            </div>
            {(characterData.secondaryCharacters ?? []).length ? (
              <>
                <Separator className="my-2 w-full" />
                <div className="flex flex-row gap-2">
                    <div className="flex flex-wrap gap-2">
                      <div className="grow-0 py-2 text-sm">Alts:</div>
                      {(characterData.secondaryCharacters ?? [])
                        .sort((a, b) => (anyAscii(a.name) > anyAscii(b.name)) ? 1 : -1)
                        .map((secondaryCharacter) => (
                          <Link
                            key={secondaryCharacter.characterId}
                            href={`/players/${secondaryCharacter.characterId}`}
                            className="bg-secondary hover:text-primary rounded-xl px-4 py-2 text-sm hover:underline flex flex-row"
                          >
                            <ClassIcon characterClass={secondaryCharacter.class.toLowerCase()} px={20} className="grow-0 mr-1" />
                            <div>{secondaryCharacter.name}</div>
                          </Link>
                        ))}
                    </div>
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
                        className="bg-primary-foreground text-primary rounded-xl px-4 py-2 text-sm hover:underline"
                      >
                        <div className="flex flex-row gap-1">
                          <div className="grow-0"><ClassIcon characterClass={characterData.primaryCharacterClass ?? "Unknown"} px={20}/></div>
                          <div className="grow">{characterData.primaryCharacterName}</div>
                        </div>
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
