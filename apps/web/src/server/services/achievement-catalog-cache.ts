import { unstable_cache, revalidateTag } from "next/cache";
import { db as appDb } from "~/server/db";
import {
  loadVisibleAchievementDefs,
  type VisibleAchievementDefs,
} from "~/server/services/achievement-queries";

const ACHIEVEMENT_CATALOG_TAG = "achievement-catalog";

// 1h fallback, not the real freshness mechanism: invalidateAchievementCatalogCache() busts the tag
// on every edit through achievement-service.ts. The fallback covers the one writer that can't
// reach Next's cache — the bootstrap-achievements script (seedAchievementDefinitions), which runs
// outside a Next request.
const REVALIDATE_SECONDS = 60 * 60;

/** The visible achievement list is identical for every viewer and only changes when an admin
 *  edits achievements, yet the Achievements page and every character page re-read it on each
 *  view (TEMPLE-151). Backed by Vercel's shared Data Cache, so it holds across users. */
const getCachedVisibleAchievementDefs = unstable_cache(
  () => loadVisibleAchievementDefs(appDb),
  ["visible-achievement-defs"],
  { tags: [ACHIEVEMENT_CATALOG_TAG], revalidate: REVALIDATE_SECONDS },
);

/**
 * The visible achievement list for the display catalog. Only the app's own database goes
 * through the cache; any other client (a test's injected fake, a transaction) is read directly,
 * so achievement-queries.ts keeps its injected-db convention.
 */
export function getVisibleAchievementDefs(db: typeof appDb): Promise<VisibleAchievementDefs> {
  return db === appDb ? getCachedVisibleAchievementDefs() : loadVisibleAchievementDefs(db);
}

/**
 * The ONLY place that should bust the catalog cache — call it after any write to `achievement` or
 * `achievement_tier` from inside the app. "max" for full immediate invalidation (Next 16 requires
 * the profile argument; see raid-attendance-by-zone.ts for why it's "max" and not updateTag).
 */
export function invalidateAchievementCatalogCache(): void {
  try {
    revalidateTag(ACHIEVEMENT_CATALOG_TAG, "max");
  } catch {
    // Best-effort: the write this follows has already committed, so a cache-bust failure must
    // not turn a successful request into a 500 — the entry heals itself via REVALIDATE_SECONDS.
  }
}
