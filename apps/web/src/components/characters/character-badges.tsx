"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import {
  BADGE_DEFINITIONS,
  type BadgeDefinition,
  type BadgeRarity,
} from "~/lib/badge-definitions";
import { evaluateAllBadges } from "~/lib/badge-evaluator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/**
 * WoW rarity colors - defined inline to ensure Tailwind JIT picks them up
 */
const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20",
  uncommon:
    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  rare: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  epic: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  legendary:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
};

const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

/**
 * Individual badge item component
 */
function BadgeItem({
  badge,
  earned,
}: {
  badge: BadgeDefinition;
  earned: boolean;
}) {
  const Icon = badge.icon;
  const colorClasses = RARITY_COLORS[badge.rarity];

  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <div
            onClick={() => setOpen((prev) => !prev)}
            className={cn(
              "group flex cursor-default flex-row items-center gap-2 rounded-lg border px-2 py-1.5 transition-all hover:scale-105",
              earned
                ? colorClasses
                : "border-gray-300 bg-gray-100 text-gray-400 opacity-20 grayscale dark:border-gray-700 dark:bg-gray-800",
            )}
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            <div className="text-xs font-semibold">{badge.name}</div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">
          <p className="max-w-xs">{badge.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const RARITY_TEXT_COLORS: Record<BadgeRarity, string> = {
  common: "text-gray-700 dark:text-gray-300",
  uncommon: "text-green-700 dark:text-green-400",
  rare: "text-blue-700 dark:text-blue-400",
  epic: "text-purple-700 dark:text-purple-400",
  legendary: "text-orange-700 dark:text-orange-400",
};

/**
 * Badge group component - displays badges for a single rarity tier
 */
function BadgeGroup({
  rarity,
  badges,
  badgeResults,
}: {
  rarity: BadgeRarity;
  badges: BadgeDefinition[];
  badgeResults: Map<string, boolean>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "text-center text-sm font-semibold",
          RARITY_TEXT_COLORS[rarity],
        )}
      >
        {RARITY_LABELS[rarity]}
      </div>
      <div className="flex flex-col gap-2">
        {badges.map((badge) => (
          <BadgeItem
            key={badge.id}
            badge={badge}
            earned={badgeResults.get(badge.id) ?? false}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Badge loading skeleton
 */
function BadgesSkeleton() {
  const rarityGroups = [
    { rarity: "common", count: 3 },
    { rarity: "uncommon", count: 3 },
    { rarity: "rare", count: 4 },
    { rarity: "epic", count: 3 },
    { rarity: "legendary", count: 1 },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {rarityGroups.map((group, groupIdx) => (
        <div key={groupIdx} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: group.count }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Character badges widget
 */
export function CharacterBadges({ characterId }: { characterId: number }) {
  // Fetch weekly attendance data
  const { data: weeklyData, isLoading: weeklyLoading } =
    api.character.getWeeklyPrimaryCharacterAttendance.useQuery({
      characterId,
      weeksBack: 6,
      includeCurrentWeek: false,
    });

  // Fetch attendance summary
  const { data: attendanceData, isLoading: attendanceLoading } =
    api.character.getPrimaryRaidAttendanceL6LockoutWk.useQuery({
      characterId,
    });

  const isLoading = weeklyLoading || attendanceLoading;

  if (isLoading) {
    return <BadgesSkeleton />;
  }

  if (!weeklyData || !attendanceData) {
    return (
      <div className="text-sm text-muted-foreground">
        Unable to load badge data.
      </div>
    );
  }

  // Get attendance stats
  const userAttendance = attendanceData[0];
  const weightedAttendance = userAttendance?.weightedAttendance ?? 0;
  const weightedAttendancePct = userAttendance?.weightedAttendancePct ?? 0;

  // Evaluate all badges
  const badgeResults = evaluateAllBadges({
    weeks: weeklyData.weeks,
    weightedAttendance,
    weightedAttendancePct,
  });

  // Group badges by rarity
  const badgesByRarity: Record<BadgeRarity, BadgeDefinition[]> = {
    common: [],
    uncommon: [],
    rare: [],
    epic: [],
    legendary: [],
  };

  for (const badge of BADGE_DEFINITIONS) {
    badgesByRarity[badge.rarity].push(badge);
  }

  const rarityOrder: BadgeRarity[] = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
  ];

  return (
    <div className="w-full">
      <div className="mb-3 text-sm text-muted-foreground">
        <span className="font-semibold">Achievements</span> – Based on last 6
        lockouts
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rarityOrder.map((rarity) => (
          <BadgeGroup
            key={rarity}
            rarity={rarity}
            badges={badgesByRarity[rarity]}
            badgeResults={badgeResults}
          />
        ))}
      </div>
    </div>
  );
}
