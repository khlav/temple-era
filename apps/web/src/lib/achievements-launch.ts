// Public launch gate for the Achievements feature. Ships hidden (nav link + FAB) and flips on
// automatically at the target instant — no redeploy needed. `fromZonedTime` resolves DST for us,
// so this stays correct without hardcoding an ET/UTC offset by hand.
//
// Temporary — once launch has passed and this is no longer needed, delete this file and drop its
// call sites: `achievementsRevealed`/`visiblePrimaryNav` in app-header.tsx, and
// `revealed`/`debugParamPresent` in reveal-fab.tsx (the latter's `debugMode` dev-replay tool can
// stay, just re-point it at a local URL-param check).
import { useEffect, useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";

export const ACHIEVEMENTS_LAUNCH_AT = fromZonedTime("2026-09-01T00:01:00", EASTERN_TIMEZONE);

/** Early-access override: present anywhere (nav, FAB) to reveal Achievements before launch. */
export const REVEAL_DEBUG_PARAM = "revealDebug";

export function isAchievementsLive(now: Date = new Date()): boolean {
  return now.getTime() >= ACHIEVEMENTS_LAUNCH_AT.getTime();
}

/**
 * Whether `name` is present in the current URL's query string. Reads `window.location.search`
 * directly rather than next/navigation's `useSearchParams()` — that hook requires every caller to
 * sit under a Suspense boundary or it breaks static generation (confirmed: it broke the
 * `/_not-found` prerender when used from the always-mounted header/FAB). False on the server and
 * on the very first client render; flips true right after mount if the param is present.
 */
export function useUrlParamPresent(name: string): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    setPresent(new URLSearchParams(window.location.search).has(name));
  }, [name]);
  return present;
}
