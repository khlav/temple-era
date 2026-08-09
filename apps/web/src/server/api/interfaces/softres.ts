/**
 * Type definitions for SoftRes API responses.
 *
 * These describe the *normalized* shape this app works with, produced by
 * `fetchSoftResRaidData` (apps/web/src/server/api/softres-client.ts) from
 * SoftRes's current live API - which uses different field names/types
 * entirely (see that file for the raw shape and the mapping). Trimmed to
 * only the fields any consumer in this codebase actually reads; SoftRes's
 * response carries plenty more that nothing here uses.
 */

export interface SoftResReservedCharacter {
  name: string;
  class: string; // Derived from the reserve's spec id - SoftRes's current API doesn't return class directly
  spec: number;
  items: number[]; // Array of item IDs
  note: string | null;
}

export interface SoftResRaidData {
  raidId: string;
  instance: string | null; // First recognized raid-zone instance id, e.g. "aq40" (can be null)
  instances?: string[]; // All recognized raid-zone instance ids for this raid
  raidDate: string; // ISO date string
  reserved: SoftResReservedCharacter[];
}
