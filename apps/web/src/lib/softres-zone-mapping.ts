/**
 * Mapping between SoftRes instance identifiers and database zone names
 *
 * SoftRes API uses instance identifiers (e.g., "aq40", "bwl", "mc", "naxxramas")
 * which map to our database zone names
 */

import { INSTANCE_TO_ZONE, type RaidZone } from "./raid-zones";

/**
 * Convert a SoftRes instance identifier to a database zone name
 * The API returns instance identifiers like "aq40", "bwl", "mc", "naxxramas"
 * Returns undefined if no mapping found or if instance is null/undefined
 */
export function mapSoftResInstanceToDb(
  instance: string | null | undefined,
): RaidZone | undefined {
  if (!instance) {
    return undefined;
  }
  // Use the existing INSTANCE_TO_ZONE mapping from raid-zones.ts
  return INSTANCE_TO_ZONE[instance];
}
