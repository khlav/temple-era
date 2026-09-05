"use client";

import * as React from "react";
import { Loader2, Play } from "lucide-react";
import { api } from "~/trpc/react";
import {
  MedalIcon,
  RevealOverlay,
  TIER_CONFIG,
  TIER_LABEL,
} from "~/components/achievements/reveal-overlay";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { CharacterLink } from "~/components/ui/character-link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { PrettyPrintDate } from "~/lib/helpers";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";
import type { AchievementLogEntry } from "~/server/services/achievement-queries";

const PAGE_SIZE = 50;

/**
 * Same play-badge-on-medal click-to-replay pattern as AchievementChip
 * (achievement-display.tsx), lifted locally rather than shared — that component's chip is a
 * fixed-size grid tile with its own name/tier layout underneath the medal, while this is a table
 * cell (medal + name/tier inline), different enough shapes that factoring out a shared trigger
 * would need its own prop surface for no real reuse win given there's exactly one caller of each.
 */
function AchievementCell({
  entry,
  onReplay,
}: {
  entry: AchievementLogEntry;
  onReplay: (achievementAwardId: string) => void;
}) {
  const tierColors = TIER_CONFIG[entry.tier];

  return (
    <button
      type="button"
      onClick={() => onReplay(entry.replayAwardId)}
      className="group flex items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-accent/40"
    >
      <div
        className="ro-icon-sm relative shrink-0"
        style={{ ["--ro-tier" as string]: tierColors.tier, ["--ro-hi" as string]: tierColors.hi }}
      >
        <MedalIcon tier={entry.tier} icon={entry.icon} />
        <span className="absolute -bottom-1 -right-1 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <Play className="size-2.5 fill-current" />
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold leading-tight">{entry.name}</span>
        <span
          className="text-[10px] uppercase tracking-wide"
          style={{ color: tierColors.labelColor }}
        >
          {TIER_LABEL[entry.tier]}
        </span>
      </div>
    </button>
  );
}

function LogRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-11 w-40 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </TableCell>
    </TableRow>
  );
}

export function AchievementLog(): React.JSX.Element {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.achievement.getAchievementLog.useInfiniteQuery(
      { limit: PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    );

  const entries = React.useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);

  const [replayAwardId, setReplayAwardId] = React.useState<string | null>(null);
  const { data: replayAward } = api.achievement.getAwardById.useQuery(
    { achievementAwardId: replayAwardId ?? "" },
    { enabled: replayAwardId !== null },
  );

  // Fires fetchNextPage as the sentinel scrolls into view — this codebase has no prior
  // infinite-scroll consumer to follow (RevealFab's own doc comment notes it established the FAB
  // pattern the same way), so this is a small local IntersectionObserver rather than a new shared
  // hook for what's currently a single caller.
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const fetchNextPageRef = React.useRef(fetchNextPage);
  fetchNextPageRef.current = fetchNextPage;
  // Read via a ref (not an effect dependency) so an in-flight fetch doesn't tear down and
  // recreate the observer — appended rows can shift the sentinel back into view mid-fetch, which
  // would otherwise fire fetchNextPage again before the previous page finished.
  const isFetchingNextPageRef = React.useRef(isFetchingNextPage);
  isFetchingNextPageRef.current = isFetchingNextPage;

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0]?.isIntersecting && !isFetchingNextPageRef.current) {
          fetchNextPageRef.current();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage]);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Date</TableHead>
              <TableHead>Achievement</TableHead>
              <TableHead>Earned By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => <LogRowSkeleton key={`skeleton-${i}`} />)}
            {!isLoading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  No achievements earned yet.
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => (
              <TableRow key={`${entry.day}-${entry.achievementTierId}`}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {PrettyPrintDate(entry.latestAwardedAt, false, EASTERN_TIMEZONE)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {entry.description ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <AchievementCell entry={entry} onReplay={setReplayAwardId} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-64 bg-secondary text-center text-muted-foreground"
                      >
                        {entry.description}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <AchievementCell entry={entry} onReplay={setReplayAwardId} />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {entry.earners.map((earner) => (
                      <div key={earner.characterId} className="w-fit">
                        <CharacterLink
                          characterId={earner.characterId}
                          characterName={earner.name}
                          characterClass={earner.class}
                          iconSize={16}
                        />
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {isFetchingNextPage && (
              <TableRow>
                <TableCell colSpan={3} className="text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div ref={sentinelRef} className="h-1" />
      </div>
      {replayAward && (
        <RevealOverlay awards={[replayAward]} onDismiss={() => setReplayAwardId(null)} />
      )}
    </TooltipProvider>
  );
}
