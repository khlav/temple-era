"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import { api } from "~/trpc/react";
import { Progress } from "~/components/ui/progress";
import { TIER_LABEL, type AchievementTierLevel } from "~/components/achievements/reveal-overlay";
import type { DisplayAchievement } from "~/server/services/achievement-queries";

// Highest tier first, then "not yet earned" — mirrors character-badges.tsx's rarity grouping.
const TIER_GROUP_ORDER: (AchievementTierLevel | "unearned")[] = [
  "platinum",
  "gold",
  "silver",
  "bronze",
  "unearned",
];

const TIER_CLASS: Record<AchievementTierLevel, string> = {
  bronze: "bg-amber-800/20 text-amber-700 dark:text-amber-400",
  silver: "bg-slate-400/20 text-slate-600 dark:text-slate-300",
  gold: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  platinum: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
};

function AchievementRow({
  name,
  highestTierEarned,
  progress,
}: {
  name: string;
  highestTierEarned: AchievementTierLevel | null;
  progress: { nextTier: AchievementTierLevel; current: number; target: number } | null;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{name}</span>
        {highestTierEarned ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_CLASS[highestTierEarned]}`}
          >
            {TIER_LABEL[highestTierEarned]}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not yet earned</span>
        )}
      </div>
      {progress && (
        <div className="flex flex-col gap-1">
          <Progress value={(progress.current / progress.target) * 100} className="h-1.5" />
          <span className="text-xs text-muted-foreground">
            {progress.current} / {progress.target} toward {TIER_LABEL[progress.nextTier]}
          </span>
        </div>
      )}
    </div>
  );
}

function groupByTier(
  achievements: DisplayAchievement[],
): Map<AchievementTierLevel | "unearned", DisplayAchievement[]> {
  const groups = new Map<AchievementTierLevel | "unearned", DisplayAchievement[]>();
  for (const a of achievements) {
    const key = a.highestTierEarned ?? "unearned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  return groups;
}

/**
 * Shared between the character page and the Trophy Case — same component, no "which page" prop,
 * since the display logic (visible-with-progress, hidden-only-after-earned) is identical in both
 * places per the contract's explicit design.
 */
export function AchievementDisplay({
  primaryCharacterId,
}: {
  primaryCharacterId: number;
}): React.JSX.Element {
  const { data, isLoading } = api.achievement.getDisplayCatalog.useQuery({ primaryCharacterId });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading achievements...</div>;
  }
  if (!data) {
    return <div className="text-sm text-muted-foreground">No achievement data.</div>;
  }

  const visibleGroups = groupByTier(data.visible);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Achievements
        </h3>
      </div>
      <div className="flex flex-col gap-4">
        {TIER_GROUP_ORDER.filter((key) => visibleGroups.has(key)).map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {key === "unearned" ? "Not yet earned" : TIER_LABEL[key]}
            </h4>
            {visibleGroups.get(key)!.map((a) => (
              <AchievementRow
                key={a.achievementId}
                name={a.name}
                highestTierEarned={a.highestTierEarned}
                progress={a.progress}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Omitted entirely when empty — not even an empty-state message, since an empty section
          header would itself hint that hidden achievements exist to find. */}
      {data.hiddenEarned.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hidden Achievements Earned
          </h4>
          {data.hiddenEarned.map((a) => (
            <AchievementRow
              key={a.achievementId}
              name={a.name}
              highestTierEarned={a.highestTierEarned}
              progress={null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
