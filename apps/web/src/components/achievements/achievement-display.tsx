"use client";

import * as React from "react";
import { Play, Plus, Trophy } from "lucide-react";
import { api } from "~/trpc/react";
import {
  MedalIcon,
  RevealOverlay,
  TIER_CONFIG,
  TIER_LABEL,
  type AchievementTierLevel,
} from "~/components/achievements/reveal-overlay";
import { Separator } from "~/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { getSpellIconUrl } from "~/hooks/use-spell-icon";
import { PrettyPrintDate } from "~/lib/helpers";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";
import { cn } from "~/lib/utils";
import type { DisplayAchievement } from "~/server/services/achievement-queries";

/** Shared by achievement-display.tsx's own header (Achievements page) and character-detail.tsx's
 *  Achievements card, so both season labels stay driven by the real `season` row rather than a
 *  hardcoded "Season 2" that would go stale the moment a new season starts. `endDate` is
 *  currently always null (Season 2 hasn't ended) — that case reads as open-ended rather than
 *  awkwardly omitting a "to" clause. */
export function formatSeasonPeriod(
  season: { name: string; startDate: Date; endDate: Date | null } | null | undefined,
): string | null {
  if (!season) return null;
  const start = PrettyPrintDate(season.startDate, false, EASTERN_TIMEZONE);
  return season.endDate
    ? `${season.name} runs from ${start} to ${PrettyPrintDate(season.endDate, false, EASTERN_TIMEZONE)}`
    : `${season.name} runs from ${start}`;
}

// Fixed display order for the Core section (For the Horde, then the 4 raid zones in release
// order, then the 3 behavioral awards) — not alphabetical or DB order, a deliberate curated
// sequence. Every other visible achievement (the 8 Classes) is ordered separately, alphabetically.
const SEASON_ORDER = [
  "For the Horde",
  "Flameeater",
  "Dragonslayer",
  "Exterminator",
  "Plaguebreaker",
  "Steadfast",
  "Flexible",
  "On Deck",
];

/**
 * Same badge-then-name shape as the reveal overlay's "Also earned" strip chips — the medal icon
 * (real MedalIcon art, not a plain image, so an earned chip actually looks like the award it is),
 * name + tier below it, description in an instant hover tooltip since a chip has no room for a
 * subline. Earned chips carry a play badge overlaid on the icon and are themselves the replay
 * trigger — there is no separate button or list. Unearned achievements render faded rather than
 * being hidden, so the full visible catalog is always on display.
 */
function AchievementChip({
  icon,
  name,
  description,
  nextTier,
  nextTierDescription,
  highestTierEarned,
  achievementAwardId,
  onReplay,
}: {
  icon: string;
  name: string;
  description: string;
  nextTier: AchievementTierLevel | null;
  nextTierDescription: string | null;
  highestTierEarned: AchievementTierLevel | null;
  achievementAwardId: string | null;
  onReplay: (achievementAwardId: string) => void;
}) {
  const earned = highestTierEarned !== null && achievementAwardId !== null;
  const tierColors = TIER_CONFIG[highestTierEarned ?? "copper"];

  const chip = (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-md p-2 text-center",
        !earned && "opacity-45",
      )}
    >
      <div
        className="ro-icon-sm relative"
        style={{ ["--ro-tier" as string]: tierColors.tier, ["--ro-hi" as string]: tierColors.hi }}
      >
        {earned ? (
          <MedalIcon tier={highestTierEarned} icon={icon} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- external CDN, not a local asset
          <img
            src={getSpellIconUrl(icon, "large")}
            alt=""
            className="size-11 rounded-md border border-border object-cover grayscale"
          />
        )}
        {earned && (
          // z-10: thorium/arcanite frames paint their own frame-border (z-index 2) and, for
          // arcanite, embers (z-index 3) — without an explicit higher z-index here this badge
          // has no z-index of its own and can lose to those at the exact corner it sits in.
          <span className="absolute -bottom-1 -right-1 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Play className="size-2.5 fill-current" />
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold leading-tight">{name}</span>
        <span
          className={cn("text-[10px] uppercase tracking-wide", !earned && "text-muted-foreground")}
          // labelColor is its own field, independent of hi (which drives the reveal ceremony's
          // border/gradient/embers/shimmer) — for most tiers it's the same swatch, but arcanite's
          // diverges so the border art isn't dragged along when only the label needs to change.
          // Falls back to the muted default when unearned, since there's no tier color to key
          // off yet.
          style={earned ? { color: tierColors.labelColor } : undefined}
        >
          {highestTierEarned ? TIER_LABEL[highestTierEarned] : "Not yet earned"}
        </span>
      </div>
    </div>
  );

  // No explicit width here — the grid variant's cells stretch their item by default anyway, and
  // a flex-wrap item (the center variant) must NOT get `w-full`, or it claims the whole row and
  // every chip ends up one-per-line instead of wrapping.
  const trigger = earned ? (
    <button
      type="button"
      onClick={() => onReplay(achievementAwardId)}
      className="cursor-pointer rounded-md transition-colors hover:bg-accent/40"
    >
      {chip}
    </button>
  ) : (
    <div>{chip}</div>
  );

  if (!description) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-64 bg-secondary text-center text-muted-foreground"
      >
        <div>{description}</div>
        {nextTier && nextTierDescription && (
          <>
            <Separator className="my-1.5" />
            <div className="italic text-muted-foreground/70">
              <div>For {TIER_LABEL[nextTier]}:</div>
              <div>{nextTierDescription}</div>
            </div>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Trailing grid cell for the Hidden section — the set of hidden achievements is open-ended (more
 *  get added through the season), so there's always more beyond whatever's been earned so far.
 *  Only rendered once at least one has been earned; the whole section stays hidden until then
 *  (see AchievementDisplay's hiddenEarned.length check) rather than teasing an empty section. Same
 *  footprint as an unearned AchievementChip so it sits in the grid like a natural next item rather
 *  than a stray label. */
function MoreHiddenChip() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-md p-2 text-center opacity-60">
      <div className="flex size-11 items-center justify-center rounded-md border border-dashed border-border">
        <Plus className="size-5 text-muted-foreground" />
      </div>
      <span className="text-xs font-semibold leading-tight text-muted-foreground">
        More to discover
      </span>
    </div>
  );
}

/** Replaces the old full-width `<h4>` header row: the label rotates 90deg and sits to the left
 *  of the section's chip grid instead of above it, with a divider between them. `flex-row`'s
 *  default `align-items: stretch` is what makes the label column span the grid's full height for
 *  free, wrapped rows included — no explicit height math needed. */
function AchievementSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-row gap-3">
      <div className="flex w-6 shrink-0 items-center justify-center border-r border-border">
        <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Every section uses the same fixed 8-column grid, left-aligned rather than centering a partial
 *  row (the Hidden section's small, variable earned count used to wrap-and-center like the reveal
 *  overlay's "Also earned" strip, which read as a stray item floating in the middle of the row).
 *  `items-start` keeps every icon flush with the top of its row regardless of neighboring chips'
 *  label height (grid row tracks default to stretch, which would otherwise vertically center
 *  content within whatever the tallest chip's height ends up being). `trailing` appends one more
 *  grid cell after the real achievements — used by the Hidden section for its "More to discover"
 *  placeholder. No card chrome of its own — these sit directly in the page/card that already
 *  contains the whole achievement display, not nested inside another bordered panel. */
function ChipPanel({
  achievements,
  onReplay,
  trailing,
}: {
  achievements: DisplayAchievement[];
  onReplay: (achievementAwardId: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-4 items-start gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {achievements.map((a) => (
        <AchievementChip
          key={a.achievementId}
          icon={a.icon}
          name={a.name}
          description={a.description}
          nextTier={a.nextTier}
          nextTierDescription={a.nextTierDescription}
          highestTierEarned={a.highestTierEarned}
          achievementAwardId={a.achievementAwardId}
          onReplay={onReplay}
        />
      ))}
      {trailing}
    </div>
  );
}

/**
 * Shared between the character page and the Achievements page — same component, no "which page" prop,
 * since the display logic (visible-with-progress, hidden-only-after-earned) is identical in both
 * places per the contract's explicit design.
 */
export function AchievementDisplay({
  primaryCharacterId,
  showHeader = true,
}: {
  /** null renders the public (logged-out) catalog — every achievement unearned, no replay. Used
   *  by the Achievements page's signed-out state so a visitor can browse the full board instead
   *  of hitting a blank gate. */
  primaryCharacterId: number | null;
  /** Off on the character page, which wraps this in its own Card + CardHeader/CardTitle to match
   *  its sibling cards (Raid attendance, Raid history) — showing both would duplicate the label. */
  showHeader?: boolean;
}): React.JSX.Element {
  const { data: ownData, isLoading: ownLoading } = api.achievement.getDisplayCatalog.useQuery(
    { primaryCharacterId: primaryCharacterId! },
    { enabled: primaryCharacterId !== null },
  );
  const { data: publicData, isLoading: publicLoading } = api.achievement.getPublicCatalog.useQuery(
    undefined,
    { enabled: primaryCharacterId === null },
  );
  const data = primaryCharacterId !== null ? ownData : publicData;
  const isLoading = primaryCharacterId !== null ? ownLoading : publicLoading;
  const [replayAwardId, setReplayAwardId] = React.useState<string | null>(null);
  const { data: replayAward } = api.achievement.getAwardById.useQuery(
    { achievementAwardId: replayAwardId ?? "" },
    { enabled: replayAwardId !== null },
  );
  const { data: season } = api.achievement.getCurrentSeason.useQuery();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading achievements...</div>;
  }
  if (!data) {
    return <div className="text-sm text-muted-foreground">No achievement data.</div>;
  }

  // Four sections: Core (the core achievements, fixed curated order), Classes (the 8
  // class-attendance achievements — identified by ruleShape, since it's unique to exactly this
  // group — alphabetical), Professions (the 8 tradeskill-mastery achievements — identified by
  // ruleShape the same way — always visible with progress, not earned-gated like Legendary,
  // since these are a normal grind rather than a surprise), and Legendary (whatever's actually
  // still hidden and earned, season- or all-time-scoped alike, combined into one section since
  // there's no separate "all time" progression to track).
  const seasonCore = data.visible
    .filter(
      (a) => a.ruleShape !== "class_attendance_threshold" && a.ruleShape !== "recipe_set_threshold",
    )
    .sort((a, b) => SEASON_ORDER.indexOf(a.name) - SEASON_ORDER.indexOf(b.name));
  const classes = data.visible
    .filter((a) => a.ruleShape === "class_attendance_threshold")
    .sort((a, b) => (a.wowClass ?? "").localeCompare(b.wowClass ?? ""));
  const professions = data.visible
    .filter((a) => a.ruleShape === "recipe_set_threshold")
    .sort((a, b) => a.name.localeCompare(b.name));
  const hiddenEarned = data.hiddenEarned;

  return (
    // A real 0ms delay meant a fast mouse sweep across a row of chips opened and closed every
    // tooltip it grazed in quick succession — each with its own fade/zoom transition — which read
    // as glitchy flicker rather than "instant." 100ms is still effectively instant for a deliberate
    // hover but ignores a pass-through graze.
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col gap-4">
        {showHeader && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {season ? `${season.name} Achievements` : "Achievements"}
              </h3>
            </div>
            {formatSeasonPeriod(season) && (
              <span className="text-xs text-muted-foreground">{formatSeasonPeriod(season)}</span>
            )}
          </div>
        )}
        <AchievementSection label="Core">
          <ChipPanel achievements={seasonCore} onReplay={setReplayAwardId} />
        </AchievementSection>
        <AchievementSection label="Class">
          <ChipPanel achievements={classes} onReplay={setReplayAwardId} />
        </AchievementSection>
        <AchievementSection label="Crafting">
          <ChipPanel achievements={professions} onReplay={setReplayAwardId} />
        </AchievementSection>
        {hiddenEarned.length > 0 && (
          <AchievementSection label="Legendary">
            <ChipPanel
              achievements={hiddenEarned}
              onReplay={setReplayAwardId}
              trailing={<MoreHiddenChip />}
            />
          </AchievementSection>
        )}
        {replayAward && (
          <RevealOverlay
            awards={[replayAward]}
            onDismiss={() => setReplayAwardId(null)}
            hideViewLink
          />
        )}
      </div>
    </TooltipProvider>
  );
}
