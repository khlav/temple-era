"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import {
  MedalIcon,
  RevealOverlay,
  TIER_CONFIG,
  collapseToHighestTierPerAchievement,
  pickHero,
} from "~/components/achievements/reveal-overlay";
import {
  REVEAL_DEBUG_PARAM,
  isAchievementsLive,
  useUrlParamPresent,
} from "~/lib/achievements-launch";

const DEBUG_PARAM = REVEAL_DEBUG_PARAM;

/**
 * Global floating button, badged with the caller's own unseen-award count. Reveal only ever
 * fires on deliberate click — never automatically — per the contract's explicit decision.
 *
 * No dedicated global "FAB" pattern exists elsewhere in this codebase (confirmed during Phase 3
 * scouting — GlobalQuickLauncher is a Cmd/Ctrl+K modal, not a floating button); this component
 * establishes the pattern rather than following one. Plain local useState is sufficient since
 * there is exactly one consumer (itself) — no shared context needed.
 *
 * The icon is the actual `MedalIcon` for the highest-tier pending award (same `pickHero` the
 * reveal overlay itself uses) rendered at `.ro-icon-sm` size, colored via that tier's real
 * TIER_CONFIG swatch — not a generic Lucide glyph in a fixed color, so the FAB previews exactly
 * what it's about to show instead of looking disconnected from the rest of the achievement UI.
 *
 * `?revealDebug=1` does two things, one per environment. Everywhere (including production), its
 * mere presence is the early-access override for `isAchievementsLive()` — see
 * `~/lib/achievements-launch` — letting the FAB (and the nav link) be previewed with real unseen
 * awards before the public launch instant. In development only, it additionally flips on
 * `debugMode`, which swaps the source from "unseen awards" to "every award this family has ever
 * earned, seenAt ignored" and skips the markSeen call on dismiss — lets the full hero+"Also
 * earned" strip ceremony be replayed on demand while iterating on the animation. The Achievements
 * page's own Replay button only replays one award at a time and can't reproduce the multi-award
 * strip. Debug mode uses the exact same pill (same medal art, same hero-tier coloring) with a
 * "[DEBUG]" prefix on the label rather than a visually distinct treatment — nothing about it
 * needs to look different, it's just fed a different award list (everything ever earned vs. only
 * what's unseen).
 */
export function RevealFab(): React.JSX.Element | null {
  const { status } = useSession();
  const debugParamPresent = useUrlParamPresent(DEBUG_PARAM);
  const debugMode = process.env.NODE_ENV === "development" && debugParamPresent;
  const revealed = isAchievementsLive() || debugParamPresent;

  const utils = api.useUtils();
  const { data: unseen } = api.achievement.getUnseenAwards.useQuery(undefined, {
    enabled: status === "authenticated" && !debugMode,
  });
  const { data: allAwards } = api.achievement.getAllAwards.useQuery(undefined, {
    enabled: status === "authenticated" && debugMode,
  });
  // Without invalidating here, the badge count would stay stale for the rest of the session:
  // RevealFab lives in the root layout and never unmounts across client-side navigation, so the
  // unseen-awards query it already fetched just keeps sitting in cache after markSeen fires.
  const markSeen = api.achievement.markSeen.useMutation({
    onSuccess: () => void utils.achievement.getUnseenAwards.invalidate(),
  });
  const [open, setOpen] = React.useState(false);

  const source = debugMode ? allAwards : unseen;

  // Display-only collapse (see collapseToHighestTierPerAchievement) — a Copper→Thorium jump
  // creates 4 real award rows, but the badge and reveal should only ever show "Thorium".
  // markSeen below still uses the raw `source` list so every underlying row gets marked seen.
  const displayAwards = React.useMemo(
    () => (source ? collapseToHighestTierPerAchievement(source) : []),
    [source],
  );

  if (!revealed || !source || source.length === 0) return null;

  const countLabel = `New Achievement${displayAwards.length === 1 ? "" : "s"}`;
  const label = debugMode
    ? `[DEBUG] ${displayAwards.length} award${displayAwards.length === 1 ? "" : "s"} to replay`
    : `${displayAwards.length} ${countLabel.toLowerCase()} to view`;

  const hero = pickHero(displayAwards);
  const heroColors = TIER_CONFIG[hero.tier];

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 hidden md:block">
        <div className="relative">
          {/* Glow, then button — siblings painted in that order, not a child of the button. A
              negative-z-index child still paints over its own parent's background per CSS paint
              order, which is what "glow washing over the pill instead of sitting behind it"
              turned out to be; plain DOM order avoids that and needs no z-index at all. */}
          <span
            className="pointer-events-none absolute -inset-2 animate-pulse rounded-full blur-xl"
            style={{ background: `${heroColors.hi}80` }}
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={label}
            className="group relative flex animate-in items-center gap-3 rounded-full border border-border/70 bg-card/95 py-2 pl-4 pr-4 shadow-lg backdrop-blur-sm zoom-in-50 duration-500 fade-in transition-colors hover:border-primary/40"
          >
            <span className="text-sm font-semibold" style={{ color: heroColors.labelColor }}>
              {debugMode ? "[DEBUG] " : ""}
              {countLabel}
            </span>
            <div
              className="ro-icon-sm relative shrink-0"
              style={{
                ["--ro-tier" as string]: heroColors.tier,
                ["--ro-hi" as string]: heroColors.hi,
              }}
            >
              <MedalIcon tier={hero.tier} icon={hero.icon} />
              <span className="absolute -right-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow">
                {displayAwards.length}
              </span>
            </div>
          </button>
        </div>
      </div>
      {open && (
        <RevealOverlay
          awards={displayAwards}
          onDismiss={() => {
            if (!debugMode) {
              markSeen.mutate({ achievementAwardIds: source.map((a) => a.achievementAwardId) });
            }
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
