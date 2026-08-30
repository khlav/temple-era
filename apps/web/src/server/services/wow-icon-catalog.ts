import iconNames from "~/server/data/wow-icon-names.json";

/** Server-only, deliberately: `wow-icon-names.json` is a ~23,500-name real Blizzard icon-texture
 *  dump (every expansion — wow.zamimg.com, the CDN this app already renders icons from, serves
 *  all of them uniformly, not just Classic-era ones), not a hand-curated guess list. Nothing here
 *  is exported for a "use client" component to import directly; the admin panel's icon picker
 *  only ever sees the small slices getRandomIconNames/searchIconNames hand back via
 *  achievement.getRandomIcons/searchIcons, never the raw ~700KB list itself. */
const ALL_ICON_NAMES: string[] = iconNames;

// Built once, lazily, off ALL_ICON_NAMES — O(1) membership checks for isValidIconName instead of
// a 23,500-entry linear scan on every achievement create/update.
let allIconNamesSet: Set<string> | null = null;
function getAllIconNamesSet(): Set<string> {
  allIconNamesSet ??= new Set(ALL_ICON_NAMES);
  return allIconNamesSet;
}

/** True iff `name` is an exact, case-sensitive match in the real Blizzard icon-texture dump.
 *  The single enforcement point for "icon must be real" — called from achievement-service.ts's
 *  createAchievement/updateAchievement, so every caller (the admin panel's tRPC path and the v1
 *  REST API alike) is covered without each having to remember to check. */
export function isValidIconName(name: string): boolean {
  return getAllIconNamesSet().has(name);
}

/** `count` distinct random names — backs both the icon picker's initial sample grid and its
 *  Randomize button (a plain refetch of the same query, which re-rolls server-side since this
 *  isn't cached against a stable input). */
export function getRandomIconNames(count: number): string[] {
  const target = Math.min(count, ALL_ICON_NAMES.length);
  const picked = new Set<string>();
  while (picked.size < target) {
    picked.add(ALL_ICON_NAMES[Math.floor(Math.random() * ALL_ICON_NAMES.length)]!);
  }
  return [...picked];
}

/** Up to `limit` names containing `query` (case-insensitive substring) — backs the icon picker's
 *  type-ahead dropdown. A plain linear scan; 23,500 substring checks is microseconds, no index
 *  needed at this scale. */
export function searchIconNames(query: string, limit: number): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: string[] = [];
  for (const name of ALL_ICON_NAMES) {
    if (name.includes(q)) {
      results.push(name);
      if (results.length >= limit) break;
    }
  }
  return results;
}
