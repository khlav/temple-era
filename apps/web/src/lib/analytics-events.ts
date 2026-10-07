/**
 * Display names for every custom PostHog event the site sends. Keeping them in one place means a
 * rename happens once, and the naming convention is visible next to the full list.
 *
 * Convention: title-cased "Feature: Action", e.g. "Achievement Reveal: Opened". Property keys stay
 * snake_case, matching PostHog's own `$current_url`-style properties.
 */
export const ANALYTICS_EVENTS = {
  achievementRevealOpened: "Achievement Reveal: Opened",
  achievementRevealDismissed: "Achievement Reveal: Dismissed",
} as const;
