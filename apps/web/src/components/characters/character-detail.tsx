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
import {
  AchievementDisplay,
  formatSeasonPeriod,
} from "~/components/achievements/achievement-display";

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
  const { data: season } = api.achievement.getCurrentSeason.useQuery();

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Left column — identity, alts, crafting */}
      <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[280px]">
        <Card className="overflow-hidden">
          <CardContent className="space-y-3 pt-4 sm:pt-4">
            <div className="flex items-start gap-3">
              <ClassIcon
                characterClass={characterData.class.toLowerCase()}
                px={32}
                className="shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-lg font-semibold leading-tight">{characterData.name}</div>
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

          {characterData.isPrimary && alts.length > 0 ? (
            <div className="border-t border-border/60 px-4 pb-3.5 pt-3 sm:px-5 sm:pb-4 sm:pt-3">
              <div className="font-display mb-2 text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                Alts · {alts.length}
              </div>
              <div className="flex flex-wrap gap-2">
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
              </div>
            </div>
          ) : null}

          {characterData.isPrimary === false ? (
            <div className="border-t border-border/60 px-4 pb-3.5 pt-3 sm:px-5 sm:pb-4 sm:pt-3">
              <div className="font-display mb-2 text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                This is an alt for
              </div>
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
            </div>
          ) : null}
        </Card>

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
              <CardContent className="pt-4 sm:pt-4">
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
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-2 pt-3">
                <CardTitle className="text-sm font-semibold tracking-tight sm:text-[15px]">
                  {season ? `${season.name} Achievements` : "Achievements"}
                </CardTitle>
                {formatSeasonPeriod(season) && (
                  <span className="text-xs text-muted-foreground">
                    {formatSeasonPeriod(season)}
                  </span>
                )}
              </CardHeader>
              <CardContent className="px-3 sm:px-3">
                <AchievementDisplay
                  primaryCharacterId={characterData.primaryCharacterId ?? characterId}
                  showHeader={false}
                />
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
            <CardContent className="pt-4 text-sm text-muted-foreground sm:pt-4">
              Raid reports are only available for primary characters.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
