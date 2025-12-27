"use client";

import Link from "next/link";
import { Separator } from "~/components/ui/separator";
import { PrimaryCharacterRaidsTable } from "~/components/characters/primary-character-raids-table";
import anyAscii from "any-ascii";
import { Button } from "~/components/ui/button";
import { Edit } from "lucide-react";
import React from "react";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterRecipes } from "~/components/characters/character-recipes";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { AttendanceProgressBar } from "~/components/common/attendance-progress-bar";
import { AttendanceHeatmapGrid } from "~/components/common/attendance-heatmap-grid";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/trpc/react";
// import { PrimaryCharacterAttendanceReport } from "~/components/characters/primary-character-attendance-report";

function CharacterAttendanceContent({ characterId }: { characterId: number }) {
  const { data: attendanceData } =
    api.character.getPrimaryRaidAttendanceL6LockoutWk.useQuery({
      characterId,
    });

  // The query already filters by characterId, so we should get at most one result
  const userAttendance = attendanceData?.[0];

  const attendancePct = userAttendance?.weightedAttendancePct ?? 0;
  const weightedAttendance = userAttendance?.weightedAttendance ?? 0;

  return (
    <>
      <AttendanceProgressBar
        attendancePct={attendancePct}
        weightedAttendance={weightedAttendance}
        showEligibility={true}
      />
      <AttendanceHeatmapGrid
        characterId={characterId}
        showCreditsRow={true}
        showSubtitle={true}
        showMaxCreditsHelper={true}
      />
    </>
  );
}

export function CharacterDetail({
  characterId,
  characterData,
  showEditButton,
  showRecipeEdit,
}: {
  characterId: number;
  characterData: RaidParticipant;
  showEditButton?: boolean;
  showRecipeEdit?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col">
        <div className="flex flex-row items-center gap-1">
          <div className="grow-0">
            <ClassIcon
              characterClass={characterData.class.toLowerCase()}
              px={32}
            />
          </div>
          <div className="grow-0 text-2xl font-bold">{characterData.name}</div>
          <div className="grow" />

          {showEditButton && (
            <div className="grow-0 align-text-top">
              <Link href={`/raid-manager/characters?s=${characterData.name}`}>
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
                  .sort((a, b) =>
                    anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
                  )
                  .map((secondaryCharacter) => (
                    <Link
                      key={secondaryCharacter.characterId}
                      href={`/characters/${secondaryCharacter.characterId}`}
                      className="flex flex-row rounded-xl bg-secondary px-4 py-2 text-sm hover:text-primary hover:underline"
                    >
                      <ClassIcon
                        characterClass={secondaryCharacter.class.toLowerCase()}
                        px={20}
                        className="mr-1 grow-0"
                      />
                      <div>{secondaryCharacter.name}</div>
                    </Link>
                  ))}
              </div>
            </div>
          </>
        ) : null}
        <Separator className="my-2 w-full" />
        <CharacterRecipes
          character={characterData}
          showRecipeEditor={showRecipeEdit}
        />
        {characterData.isPrimary && (
          <>
            <Separator className="my-2 w-full" />
            <Card>
              <CardHeader className="pb-0">
                <div className="font-bold">
                  Raid Attendance, Last 6 lockouts
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <CharacterAttendanceContent characterId={characterId} />
              </CardContent>
            </Card>
          </>
        )}
        {characterData.isPrimary == false && (
          <>
            <Separator className="my-2 w-full" />
            <div className="flex flex-row gap-2">
              <>
                <div className="flex flex-wrap gap-2">
                  <div className="grow-0 py-2 text-sm">This is an alt for:</div>
                  <Link
                    href={`/characters/${characterData.primaryCharacterId}`}
                    className="rounded-xl bg-primary-foreground px-4 py-2 text-sm text-primary hover:underline"
                  >
                    <div className="flex flex-row gap-1">
                      <div className="grow-0">
                        <ClassIcon
                          characterClass={
                            characterData.primaryCharacterClass ?? "Unknown"
                          }
                          px={20}
                        />
                      </div>
                      <div className="grow">
                        {characterData.primaryCharacterName}
                      </div>
                    </div>
                  </Link>
                </div>
              </>
            </div>
          </>
        )}

        <Separator className="my-2 w-full" />
        <div className="">
          {characterData.isPrimary ? (
            <div className="text-md text-muted-foreground">
              <PrimaryCharacterRaidsTable
                characterId={characterId}
                characterData={characterData}
              />
            </div>
          ) : (
            <div className="text-md text-muted-foreground">
              Raid reports are only available for primary characters.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
