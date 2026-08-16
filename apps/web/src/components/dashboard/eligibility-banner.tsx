"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { env } from "~/env";
import type { Session } from "next-auth";

/**
 * Full-width eligibility strip above the dashboard's top row. Reuses the same
 * profile/attendance queries PersonalAttendanceSummary fetches (same react-query
 * cache key), so this doesn't add a second round trip in practice.
 */
export function EligibilityBanner({ currentUserSession }: { currentUserSession?: Session }) {
  const { data: userProfile } = api.profile.getMyProfile.useQuery(undefined, {
    enabled: !!currentUserSession?.user,
  });
  const activeCharacterId = userProfile?.characterId;

  const { data: attendanceData } = api.character.getPrimaryRaidAttendanceL6LockoutWk.useQuery(
    { characterId: activeCharacterId ?? -1 },
    { enabled: !!activeCharacterId },
  );

  const userAttendance = attendanceData?.[0];
  if (!activeCharacterId || !userAttendance) return null;

  const pct = Math.round((userAttendance.weightedAttendancePct ?? 0) * 100);
  const isEligible = pct >= 50;
  const credits = userAttendance.weightedAttendance ?? 0;
  const total = userAttendance.weightedRaidTotal ?? 0;
  const name = userAttendance.name;

  return (
    <div className="panel-surface rounded-2xl border border-primary/35 bg-primary/12 px-5 py-3.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {isEligible ? (
              <span className="text-primary">
                You&apos;re eligible for SR restricted Naxx items
              </span>
            ) : (
              <span className="text-muted-foreground">
                Not yet eligible for SR restricted Naxx items
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {pct}% over the last 6 lockouts · {credits} of {total} credits
            {name ? (
              <>
                {" "}
                · counted as{" "}
                <Link
                  href={`/characters/${activeCharacterId}`}
                  className="hover:text-primary hover:underline"
                >
                  {name}
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <Link
          href={env.NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL}
          target="_blank"
          className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
        >
          Loot & attendance policy
        </Link>
      </div>
    </div>
  );
}
