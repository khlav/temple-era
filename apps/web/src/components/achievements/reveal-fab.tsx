"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import type { UnseenAward } from "~/server/services/achievement-queries";
import {
  MedalIcon,
  RevealOverlay,
  TIER_CONFIG,
  collapseToHighestTierPerAchievement,
  pickHero,
} from "~/components/achievements/reveal-overlay";

const DEBUG_PARAM = "revealDebug";

/**
 * Whether `name` is present in the current URL's query string. False on the server and on the
 * very first client render; flips true right after mount if the param is present.
 */
function useUrlParamPresent(name: string): boolean {
  const [present, setPresent] = React.useState(false);
  React.useEffect(() => {
    setPresent(new URLSearchParams(window.location.search).has(name));
  }, [name]);
  return present;
}

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
 * reveal overlay itself uses) rendered at `.ro-icon-md` size, colored via that tier's real
 * TIER_CONFIG swatch — not a generic Lucide glyph in a fixed color, so the FAB previews exactly
 * what it's about to show instead of looking disconnected from the rest of the achievement UI.
 * The glow behind it is grounded in `tier` (each swatch's identity color) with a 30% lift toward
 * `hi` for brightness — the same tier/hi resting-state relationship the reveal ceremony's own
 * arcanite heat-pulse uses (see `ro-heatBreath` in reveal-overlay.css). A glow built from `hi`
 * alone reads as flatly gold for arcanite instead of red-hot, since `hi` there is a transient
 * flash color, not the tier's identity.
 *
 * A periodic "notice me" nudge (`ro-fab-attention` in reveal-overlay.css) plays on an 8s interval
 * on top of the ambient glow pulse — deliberately not continuous motion, which reads as background
 * noise within a few seconds; a bounce that recurs on an interval keeps drawing the eye each time
 * without being constantly distracting.
 *
 * Marking seen happens on the FAB's own click, not on the overlay's dismiss: the click that opens
 * the reveal is the moment the user has committed to viewing it, and the FAB itself disappears
 * in that same instant (optimistically, via markSeen's onMutate below — it doesn't wait on the
 * round trip). The overlay then plays its full ceremony against `revealAwards`, a snapshot taken
 * at click time, so the optimistic cache update (or the real invalidate that follows it) can't
 * empty `source` and unmount the overlay out from under a ceremony that's still playing.
 *
 * `?revealDebug=1`, in development only, flips on `debugMode`, which swaps the source from
 * "unseen awards" to "every award this family has ever earned, seenAt ignored" and skips the
 * markSeen call entirely — lets the full hero+"Also earned" strip ceremony be replayed on demand
 * while iterating on the animation. The Achievements page's own Replay button only replays one
 * award at a time and can't reproduce the multi-award strip. Debug mode uses the exact same pill
 * (same medal art, same hero-tier coloring) with a "[DEBUG]" prefix on the label rather than a
 * visually distinct treatment — nothing about it needs to look different, it's just fed a
 * different award list (everything ever earned vs. only what's unseen).
 */
export function RevealFab(): React.JSX.Element | null {
  const { status } = useSession();
  const debugParamPresent = useUrlParamPresent(DEBUG_PARAM);
  const debugMode = process.env.NODE_ENV === "development" && debugParamPresent;

  const utils = api.useUtils();
  const { data: unseen } = api.achievement.getUnseenAwards.useQuery(undefined, {
    enabled: status === "authenticated" && !debugMode,
  });
  const { data: allAwards } = api.achievement.getAllAwards.useQuery(undefined, {
    enabled: status === "authenticated" && debugMode,
  });
  // Optimistic: the FAB shouldn't wait on this round trip (or on the user finishing/dismissing
  // the reveal ceremony) to disappear — onMutate clears the cache the instant the click fires,
  // onError puts it back if the server call actually fails. onSettled's invalidate is the
  // long-term source of truth (also covers this same family's other tabs/sessions); the
  // optimistic setData is just what makes THIS click feel instant.
  const markSeen = api.achievement.markSeen.useMutation({
    onMutate: async ({ achievementAwardIds }) => {
      await utils.achievement.getUnseenAwards.cancel();
      const previous = utils.achievement.getUnseenAwards.getData();
      // Filter out only the ids being marked, rather than blanking the whole cache — a background
      // refetch could have landed a newer unseen award between render and this click, and a blind
      // `setData(undefined, [])` would optimistically hide that one too until onSettled's
      // invalidate brings it back.
      utils.achievement.getUnseenAwards.setData(undefined, (current) =>
        (current ?? []).filter((award) => !achievementAwardIds.includes(award.achievementAwardId)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.achievement.getUnseenAwards.setData(undefined, ctx.previous);
    },
    onSettled: () => void utils.achievement.getUnseenAwards.invalidate(),
  });
  const [open, setOpen] = React.useState(false);
  // Snapshot of exactly what's being revealed, captured once at click time — see the
  // "Marking seen" doc paragraph above for why this can't just keep reading `displayAwards` live.
  const [revealAwards, setRevealAwards] = React.useState<UnseenAward[]>([]);

  const source = debugMode ? allAwards : unseen;

  // Display-only collapse (see collapseToHighestTierPerAchievement) — a Copper→Thorium jump
  // creates 4 real award rows, but the badge and reveal should only ever show "Thorium".
  // markSeen below still uses the raw `source` list so every underlying row gets marked seen.
  const displayAwards = React.useMemo(
    () => (source ? collapseToHighestTierPerAchievement(source) : []),
    [source],
  );

  const hasPending = displayAwards.length > 0;
  if (!hasPending && !open) return null;

  const countLabel = `New Achievement${displayAwards.length === 1 ? "" : "s"}`;
  const label = debugMode
    ? `[DEBUG] ${displayAwards.length} award${displayAwards.length === 1 ? "" : "s"} to replay`
    : `${displayAwards.length} ${countLabel.toLowerCase()} to view`;

  const handleOpen = () => {
    if (!source || source.length === 0) return;
    setRevealAwards(displayAwards);
    setOpen(true);
    if (!debugMode) {
      markSeen.mutate({ achievementAwardIds: source.map((a) => a.achievementAwardId) });
    }
  };

  const hero = hasPending ? pickHero(displayAwards) : null;
  const heroColors = hero ? TIER_CONFIG[hero.tier] : null;

  return (
    <>
      {!open && hero && heroColors && (
        <div className="fixed top-30 left-1/2 z-30 -translate-x-1/2">
          <div className="relative ro-fab-attention">
            {/* Glow, then button — siblings painted in that order, not a child of the button. A
                negative-z-index child still paints over its own parent's background per CSS paint
                order, which is what "glow washing over the pill instead of sitting behind it"
                turned out to be; plain DOM order avoids that and needs no z-index at all. */}
            <span
              className="pointer-events-none absolute -inset-2 animate-pulse rounded-full blur-xl"
              style={{
                background: `color-mix(in srgb, color-mix(in srgb, ${heroColors.tier} 70%, ${heroColors.hi} 30%) 55%, transparent)`,
              }}
            />
            <button
              type="button"
              onClick={handleOpen}
              aria-label={label}
              className="group relative flex animate-in items-center gap-4 rounded-full border border-border/70 bg-card/95 py-3 pl-5 pr-5 shadow-lg backdrop-blur-sm zoom-in-50 animation-duration-500 fade-in transition-all duration-250 hover:scale-110 hover:border-primary/40 cursor-pointer"
            >
              <span className="text-base font-semibold" style={{ color: heroColors.labelColor }}>
                {debugMode ? `[DEBUG] ${countLabel}` : countLabel}
              </span>
              <div
                className="ro-icon-md relative shrink-0"
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
      )}
      {open && revealAwards.length > 0 && (
        <RevealOverlay awards={revealAwards} onDismiss={() => setOpen(false)} />
      )}
    </>
  );
}
