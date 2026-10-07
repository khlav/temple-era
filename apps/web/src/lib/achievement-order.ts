/**
 * Display order for the Core achievements — a curated sequence, not alphabetical or DB order:
 * attendance first, then the behavioral awards, then the four raid zones in release order. Shared
 * by every surface that lists the Core line (the public/character achievement display and the
 * admin catalog) so they can't drift apart.
 */
export const CORE_ACHIEVEMENT_ORDER = [
  "For the Horde",
  "Steadfast",
  "Flexible",
  "On Deck",
  "Flameeater",
  "Dragonslayer",
  "Exterminator",
  "Plaguebreaker",
] as const;

/** Comparator for `Array.prototype.sort`. A Core achievement missing from the list sorts after
 *  every listed one, keeping its incoming relative order (sort is stable), rather than jumping
 *  to the front the way a raw `indexOf` of -1 would. */
export function compareCoreAchievements(a: { name: string }, b: { name: string }): number {
  return coreRank(a.name) - coreRank(b.name);
}

function coreRank(name: string): number {
  const index = (CORE_ACHIEVEMENT_ORDER as readonly string[]).indexOf(name);
  return index === -1 ? CORE_ACHIEVEMENT_ORDER.length : index;
}
