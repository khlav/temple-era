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

export function PersonalAttendanceSummary({
  currentUserSession,
  currentUserCharacterId,
}: {
  currentUserSession?: Session;
  currentUserCharacterId?: number;
}) {
  const { data: attendanceData } =
    api.character.getPrimaryRaidAttendanceL6LockoutWk.useQuery(
      { characterId: currentUserCharacterId ?? -1 },
      { enabled: !!currentUserCharacterId },
    );
  const { data: characterData } = api.character.getCharacterById.useQuery(
    currentUserCharacterId ?? -1,
    { enabled: !!currentUserCharacterId },
  );

  // Get character name and class for title
  const getTitle = () => {
    if (!currentUserSession?.user) {
      return { characterName: null, characterClass: undefined };
    }
    if (!currentUserCharacterId) {
      return { characterName: null, characterClass: undefined };
    }
    const userAttendance = attendanceData?.find(
      (raider) => raider.characterId === currentUserCharacterId,
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

  // No session state
  if (!currentUserSession?.user) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {titleClass && <ClassIcon characterClass={titleClass} px={20} />}
            {titleData.characterName ? (
              <span>
                <span className="font-bold">{titleData.characterName}</span> —
                Raid Attendance, Last 6 lockouts
              </span>
            ) : (
              <span>Raid Attendance, Last 6 lockouts</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-center">
              <div className="mb-2 text-sm">
                Log in with Discord and select your primary character to view
                your attendance
              </div>
              <div className="flex justify-center">
                <Button
                  onClick={() =>
                    signIn("discord", { redirectTo: "/?signin=1" })
                  }
                  className="flex items-center justify-center gap-2 bg-[#5865F2] transition-all duration-200 ease-in-out hover:bg-[#8891f2]"
                >
                  <Image
                    src="/img/discord-mark-white.svg"
                    alt="Discord"
                    height={24}
                    width={24}
                  />
                  <span className="text-secondary-foreground">
                    Sign in with Discord
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Session but no character state
  if (!currentUserCharacterId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {titleClass && <ClassIcon characterClass={titleClass} px={20} />}
            {titleData.characterName ? (
              <span>
                <span className="font-bold">{titleData.characterName}</span> —
                Raid Attendance, Last 6 lockouts
              </span>
            ) : (
              <span>Raid Attendance, Last 6 lockouts</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-center">
              <div className="mb-2 text-sm">
                Select your primary character to view your attendance
              </div>
              <Button asChild>
                <Link href="/profile">Go to Profile</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get user's attendance data (query already filters by characterId, so we get at most one result)
  const userAttendance = attendanceData?.[0];

  const attendancePct = userAttendance?.weightedAttendancePct ?? 0;

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center gap-1">
          {titleData.characterName && currentUserCharacterId ? (
            <>
              <Link
                href={`/characters/${currentUserCharacterId}`}
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
        {currentUserCharacterId && (
          <AttendanceHeatmapGrid
            characterId={currentUserCharacterId}
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
