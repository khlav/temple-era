"use client";

import * as React from "react";
import Image from "next/image";
import { Info } from "lucide-react";
import type { Session } from "next-auth";
import { signIn } from "next-auth/react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { AchievementDisplay } from "~/components/achievements/achievement-display";

/** Thin, non-blocking banner — same shape as raid-plan-public-view.tsx's logged-out banner — so a
 *  signed-out visitor still sees the full catalog (unearned) below instead of a blocking gate. */
function SignInBanner() {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
      <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => signIn("discord", { redirectTo: "/achievements?signin=1" })}
          size="sm"
          className="h-7 gap-2 bg-[#5865F2] px-2 text-xs text-white hover:bg-[#8891f2]"
        >
          <Image src="/img/discord-mark-white.svg" alt="Discord" height={14} width={14} />
          Sign in with Discord
        </Button>
        <span>to see your progress.</span>
      </div>
    </div>
  );
}

export function AchievementCase({
  currentUserSession,
}: {
  currentUserSession?: Session;
}): React.JSX.Element {
  // Gated on the server-resolved session rather than firing unconditionally — getMyProfile is a
  // protectedProcedure, and an unauthenticated call would otherwise surface as an unhandled query
  // error (the same class of bug the reveal FAB had before it was gated the same way).
  const { data: profile } = api.profile.getMyProfile.useQuery(undefined, {
    enabled: !!currentUserSession,
  });

  if (!currentUserSession) {
    return (
      <>
        <SignInBanner />
        <AchievementDisplay primaryCharacterId={null} />
      </>
    );
  }

  const character = profile?.character;
  // getMyProfile's "no user found" fallback branch returns a character literal without
  // primaryCharacterId (a distinct, narrower shape from the real-user branch) — the `in` check
  // narrows the union rather than assuming the field always exists.
  const primaryCharacterId =
    character && "primaryCharacterId" in character
      ? (character.primaryCharacterId ?? character.characterId)
      : null;

  if (!primaryCharacterId || primaryCharacterId < 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Link a character on your profile to see your achievements.
      </div>
    );
  }

  return <AchievementDisplay primaryCharacterId={primaryCharacterId} />;
}
