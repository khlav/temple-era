"use client";

import Link from "next/link";
import { PrimaryCharacterRaidsTable } from "~/components/characters/primary-character-raids-table";
import { Button } from "~/components/ui/button";
import { Edit } from "lucide-react";
import React from "react";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterRecipes } from "~/components/characters/character-recipes";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { AttendanceProgressBar } from "~/components/common/attendance-progress-bar";
import { AttendanceHeatmapGrid } from "~/components/common/attendance-heatmap-grid";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { api } from "~/trpc/react";
import { CharacterBadges } from "~/components/characters/character-badges";

function AttendanceCardContent({
  characterId,
  isIgnored,
}: {
  characterId: number;
  isIgnored?: boolean;
}) {
  const { data: attendanceData } = api.character.getPrimaryRaidAttendanceL6LockoutWk.useQuery({
    characterId,
  });

  // The query already filters by characterId, so we should get at most one result
  const userAttendance = attendanceData?.[0];

  const attendancePct = userAttendance?.weightedAttendancePct ?? 0;
  const weightedAttendance = userAttendance?.weightedAttendance ?? 0;

  return isIgnored ? (
    <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      Excluded from attendance tracking
    </div>
  ) : (
    <AttendanceProgressBar
      attendancePct={attendancePct}
      weightedAttendance={weightedAttendance}
      showEligibility={true}
    />
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
  const alts = (characterData.secondaryCharacters ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Left column — identity, alts, crafting */}
      <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[280px]">
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-start gap-3">
              <ClassIcon
                characterClass={characterData.class.toLowerCase()}
                px={32}
                className="shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold leading-tight">{characterData.name}</div>
                  {characterData.isPrimary && alts.length > 0 ? (
                    <span className="font-display shrink-0 rounded-md border border-border/90 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      main
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {characterData.class} · {characterData.server}
                </div>
              </div>
            </div>
            {showEditButton && (
              <Link href={`/raid-manager/characters?s=${characterData.name}`} className="block">
                <Button variant="outline" size="sm" className="w-full">
                  <Edit className="h-4 w-4" />
                  Assign main / alts
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {characterData.isPrimary && alts.length > 0 ? (
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-semibold tracking-tight sm:text-[15px]">
                Alts · {alts.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {alts.map((secondaryCharacter) => (
                <Link
                  key={secondaryCharacter.characterId}
                  href={`/characters/${secondaryCharacter.characterId}`}
                  className="flex flex-row items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-sm hover:text-primary hover:underline"
                >
                  <ClassIcon
                    characterClass={secondaryCharacter.class.toLowerCase()}
                    px={18}
                    className="shrink-0 rounded-sm opacity-85"
                  />
                  <div>{secondaryCharacter.name}</div>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {characterData.isPrimary === false ? (
          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm font-semibold tracking-tight sm:text-[15px]">
                This is an alt for
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`/characters/${characterData.primaryCharacterId}`}
                className="flex w-fit flex-row items-center gap-2 rounded-xl bg-primary-foreground px-3 py-1.5 text-sm text-primary hover:underline"
              >
                <ClassIcon
                  characterClass={characterData.primaryCharacterClass ?? "Unknown"}
                  px={20}
                />
                <div>{characterData.primaryCharacterName}</div>
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <CharacterRecipes character={characterData} showRecipeEditor={showRecipeEdit} />
      </div>

      {/* Right column — attendance, heatmap, achievements, raid history */}
      <div className="min-w-0 flex-1 space-y-4">
        {characterData.isPrimary ? (
          <>
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold tracking-tight sm:text-[15px]">
                  Raid attendance · last 6 lockouts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AttendanceCardContent
                  characterId={characterId}
                  isIgnored={characterData.isIgnored}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <AttendanceHeatmapGrid
                  characterId={characterId}
                  showCreditsRow={true}
                  showSubtitle={true}
                  showMaxCreditsHelper={true}
                  weeksBack={18}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <CharacterBadges characterId={characterId} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-semibold tracking-tight sm:text-[15px]">
                  Raid history
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PrimaryCharacterRaidsTable
                  characterId={characterId}
                  characterData={characterData}
                />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              Raid reports are only available for primary characters.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
