/**
 * Type definitions for SoftRes API responses
 */

export interface SoftResReservedCharacter {
  name: string;
  class: string;
  spec: number;
  items: number[]; // Array of item IDs
  note: string;
  created: string; // ISO date string
  updated: string; // ISO date string
  dId?: string; // Discord user ID
  dU?: string; // Discord username
  count?: number;
}

export interface SoftResItemNote {
  id: number;
  hardReserved: boolean;
  ignoreClassRestrict: boolean;
  note: string;
  raider: string;
  roles: string[];
  specs: number[];
}

export interface SoftResRaidData {
  _id: string;
  raidId: string;
  edition: string;
  instance: string | null; // e.g., "aq40", "bwl", "mc", "naxxramas" (can be null)
  instances?: string[]; // Array of instance identifiers (e.g., ["naxxramas"])
  discord: boolean;
  discordId?: string;
  discordInvite?: string | null;
  reserved: SoftResReservedCharacter[];
  modifications: number;
  faction: string;
  amount: number;
  lock: boolean;
  note: string;
  raidDate: string; // ISO date string
  lockRaidDate: boolean;
  hideReserves: boolean;
  allowDuplicate: boolean;
  itemLimit: number;
  plusModifier: number;
  plusType: number;
  restrictByClass: boolean;
  characterNotes: boolean;
  itemNotes: SoftResItemNote[];
  date: string; // ISO date string
  updated: string; // ISO date string
  raidHelper: boolean;
  lastLockedDate?: string; // ISO date string
}
