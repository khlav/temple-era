"use client";

import React from "react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import type { Session } from "next-auth";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import Image from "next/image";
import { ClassIcon } from "~/components/ui/class-icon";
import { AttendanceProgressBar } from "~/components/common/attendance-progress-bar";
import { AttendanceHeatmapGrid } from "~/components/common/attendance-heatmap-grid";
import { CharacterSelector } from "~/components/characters/character-selector";

export function PersonalAttendanceSummary({
  currentUserSession,
  currentUserCharacterId,
}: {
  currentUserSession?: Session;
  currentUserCharacterId?: number;
}) {
  // Fetch profile client-side to ensure updates (like character selection) are reflected immediately
  // without needing a page refresh to update the server-passed currentUserCharacterId prop.
  const { data: userProfile } = api.profile.getMyProfile.useQuery(undefined, {
    enabled: !!currentUserSession?.user,
  });

  const activeCharacterId = userProfile?.characterId ?? currentUserCharacterId;

  const { data: attendanceData } =
    api.character.getPrimaryRaidAttendanceL6LockoutWk.useQuery(
      { characterId: activeCharacterId ?? -1 },
      { enabled: !!activeCharacterId },
    );
  const { data: characterData } = api.character.getCharacterById.useQuery(
    activeCharacterId ?? -1,
    { enabled: !!activeCharacterId },
  );

  const utils = api.useUtils();
  const saveProfileMutation = api.profile.saveMyProfile.useMutation({
    onSuccess: async () => {
      await utils.profile.getMyProfile.invalidate();
      await utils.character.getPrimaryRaidAttendanceL6LockoutWk.invalidate();
    },
  });

  // Get character name and class for title
  const getTitle = () => {
    if (!currentUserSession?.user) {
      return { characterName: null, characterClass: undefined };
    }
    if (!activeCharacterId) {
      return { characterName: null, characterClass: undefined };
    }
    const userAttendance = attendanceData?.find(
      (raider) => raider.characterId === activeCharacterId,
    );
    const characterName = userAttendance?.name;
    const characterClass = characterData?.class;

    if (!characterName) {
      return { characterName: null, characterClass: undefined };
    }

    return { characterName, characterClass };
  };

  const titleData = getTitle();
  const titleClass = titleData.characterClass;
  // Generate randomized sample data for the blurred background
  const sampleData = React.useMemo(() => {
    const weeks = [];
    const now = new Date();
    let totalWeightedAttendance = 0;

    // Generate 7 weeks of data (current + 6 historical)
    for (let i = 6; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);

      const isHistorical = i > 0;

      // Use deterministic math so server/client renders match (avoid hydration errors)
      // but still look "random"
      const attendedNaxx = (i * 7 + 3) % 10 > 3;
      const attendedAQ40 = (i * 5 + 2) % 10 > 3;
      const attendedBWL = (i * 3 + 1) % 10 > 4;
      const attendedMC = (i * 2 + 5) % 10 > 2;

      // Calculate points for this week
      let weekPoints = 0;
      if (attendedNaxx) weekPoints += 1;
      if (attendedAQ40) weekPoints += 1;
      if (attendedBWL) weekPoints += 1;

      const cappedBeforeMC = weekPoints >= 3;
      // MC gives 0.5 points unless already capped
      if (attendedMC && !cappedBeforeMC) {
        weekPoints += 0.5;
      }

      const cappedPoints = Math.min(weekPoints, 3);

      // Only count towards total if it's one of the 6 historical weeks
      // The loop goes from i=6 (oldest) to i=0 (newest/current)
      // We want to skip i=0 (current week) for the score, assuming standard logic
      if (i > 0) {
        totalWeightedAttendance += cappedPoints;
      }

      weeks.push({
        weekStart: weekStart.toISOString(),
        isHistorical,
        zones: {
          naxxramas: attendedNaxx
            ? {
                attended: true,
                attendanceWeight: 1,
                raids: [
                  {
                    name: "Naxxramas",
                    status: (i + 4) % 10 > 8 ? "bench" : "attendee",
                    characterNames: ["Sample"],
                  },
                ] as any,
              }
            : undefined,
          aq40: attendedAQ40
            ? {
                attended: true,
                attendanceWeight: 1,
                raids: [
                  {
                    name: "Temple of Ahn'Qiraj",
                    status: "attendee",
                    characterNames: ["Sample"],
                  },
                ] as any,
              }
            : undefined,
          bwl: attendedBWL
            ? {
                attended: true,
                attendanceWeight: 1,
                raids: [
                  {
                    name: "Blackwing Lair",
                    status: "attendee",
                    characterNames: ["Sample"],
                  },
                ] as any,
              }
            : undefined,
          mc: attendedMC
            ? {
                attended: true,
                attendanceWeight: 1,
                raids: [
                  {
                    name: "Molten Core",
                    status: "attendee",
                    characterNames: ["Sample"],
                  },
                ] as any,
                // Grayed out if we already hit cap with other raids
                isGrayed: cappedBeforeMC,
              }
            : undefined,
        },
      });
    }

    // Sort weeks by date ascending (oldest first) as expected by heatmap
    weeks.sort(
      (a, b) =>
        new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
    );

    return {
      heatmap: { weeks },
      stats: {
        weightedAttendance: totalWeightedAttendance,
        attendancePct: totalWeightedAttendance / 18,
      },
    };
  }, []);

  // Show login/select character prompt if not fully authenticated/configured
  if (!currentUserSession?.user || !activeCharacterId) {
    return (
      <Card className="relative overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span>Raid Attendance, Last 6 lockouts</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* Blurred Background Content */}
          <div className="pointer-events-none select-none opacity-50 blur-[2px]">
            <AttendanceProgressBar
              attendancePct={sampleData.stats.attendancePct}
              weightedAttendance={sampleData.stats.weightedAttendance}
              showEligibility={true}
            />
            <div className="mt-4">
              <AttendanceHeatmapGrid
                sampleData={sampleData.heatmap}
                showCreditsRow={true}
                showSubtitle={true}
                showMaxCreditsHelper={true}
                weeksBack={6}
              />
            </div>
          </div>

          {/* Foreground Actions */}
          <div className="absolute inset-x-0 top-[20%] z-10 flex justify-center p-6 text-center">
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              {!currentUserSession?.user ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    onClick={() =>
                      signIn("discord", { redirectTo: "/?signin=1" })
                    }
                    size="sm"
                    className="flex items-center gap-2 bg-[#5865F2] text-white hover:bg-[#8891f2]"
                  >
                    <Image
                      src="/img/discord-mark-white.svg"
                      alt="Discord"
                      height={14}
                      width={14}
                    />
                    Sign in with Discord
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    and select your primary character to view your attendance.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <CharacterSelector
                    onSelectAction={(char) => {
                      saveProfileMutation.mutate({
                        name: currentUserSession.user.name ?? "Unknown",
                        characterId: char.characterId,
                      });
                    }}
                    characterSet="primary"
                  >
                    <Button variant="outline" size="sm" className="h-8">
                      Select primary character
                    </Button>
                  </CharacterSelector>
                  <p className="text-sm text-muted-foreground">
                    to view your attendance.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get user's attendance data
  const userAttendance = attendanceData?.[0];

  const attendancePct = userAttendance?.weightedAttendancePct ?? 0;

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center gap-1">
          {titleData.characterName && activeCharacterId ? (
            <>
              <Link
                href={`/characters/${activeCharacterId}`}
                className="flex items-center gap-1 transition-all hover:text-primary"
              >
                {titleClass && (
                  <ClassIcon characterClass={titleClass} px={20} />
                )}
                <span className="font-bold">{titleData.characterName}</span>
              </Link>
              <span>— Raid Attendance, Last 6 lockouts</span>
            </>
          ) : (
            <>
              {titleClass && <ClassIcon characterClass={titleClass} px={20} />}
              <span>Raid Attendance, Last 6 lockouts</span>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Progress Bar */}
        <AttendanceProgressBar
          attendancePct={attendancePct}
          weightedAttendance={userAttendance?.weightedAttendance ?? 0}
          showEligibility={true}
        />

        {/* Heatmap Grid */}
        {activeCharacterId && (
          <AttendanceHeatmapGrid
            characterId={activeCharacterId}
            showCreditsRow={true}
            showSubtitle={true}
            showMaxCreditsHelper={true}
            weeksBack={6}
          />
        )}
      </CardContent>
    </Card>
  );
}
