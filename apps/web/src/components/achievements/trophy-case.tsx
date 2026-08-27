"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { AchievementDisplay } from "~/components/achievements/achievement-display";
import {
  RevealOverlay,
  TIER_LABEL,
  type AchievementTierLevel,
} from "~/components/achievements/reveal-overlay";

function ReplayList({ primaryCharacterId }: { primaryCharacterId: number }) {
  const { data: awards } = api.achievement.listAwardsForFamily.useQuery({ primaryCharacterId });
  const [replayAwardId, setReplayAwardId] = React.useState<string | null>(null);
  const { data: replayAward } = api.achievement.getAwardById.useQuery(
    { achievementAwardId: replayAwardId ?? "" },
    { enabled: replayAwardId !== null },
  );

  if (!awards || awards.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Every award
      </h3>
      <div className="flex flex-col gap-1.5">
        {awards.map((award) => (
          <div
            key={award.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>
              {award.achievementTier.achievement.name} —{" "}
              <span className="text-muted-foreground">
                {TIER_LABEL[award.achievementTier.tier as AchievementTierLevel]}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setReplayAwardId(award.id)}>
              <Play className="mr-1 size-3.5" /> Replay
            </Button>
          </div>
        ))}
      </div>
      {replayAward && (
        <RevealOverlay awards={[replayAward]} onDismiss={() => setReplayAwardId(null)} />
      )}
    </div>
  );
}

export function TrophyCase(): React.JSX.Element {
  const { data: profile } = api.profile.getMyProfile.useQuery();
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
        Link a character on your profile to see your trophy case.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AchievementDisplay primaryCharacterId={primaryCharacterId} />
      <ReplayList primaryCharacterId={primaryCharacterId} />
    </div>
  );
}
