/**
 * Item ID to name mappings from softres.it
 *
 * Provides type definitions, interfaces, and functions for working with WoW Classic Era
 * item data. Items are split by instance (MC, BWL, AQ40, etc.) and loaded on-demand
 * from JSON files to optimize bundle size.
 *
 * This module includes:
 * - Type definitions for equipment slots, item quality, and instance identifiers
 * - ItemMapping interface for item data structure
 * - Public API functions for querying items by ID or zone
 * - Internal loading and caching mechanisms for efficient data access
 */

import type { RaidZone } from "./raid-zones";
import { getInstancesForZone } from "./zone-instance-map";

/**
 * Equipment slot types for items
 */
export const EQUIP_SLOTS = [
  "Back",
  "Bag",
  "Chest",
  "Feet",
  "Finger",
  "Hands",
  "Head",
  "Held In Off-hand",
  "Legs",
  "Main Hand",
  "Neck",
  "Off Hand",
  "One-Hand",
  "Ranged",
  "Relic",
  "Shield",
  "Shoulder",
  "Trinket",
  "Two-Hand",
  "Waist",
  "Wrist",
] as const;

export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/**
 * Item quality types
 */
export const ITEM_QUALITIES = ["Epic", "Rare", "Uncommon"] as const;

export type ItemQuality = (typeof ITEM_QUALITIES)[number];

/**
 * Instance identifiers for Classic Era raids
 */
export const ITEM_INSTANCES = [
  "aq20",
  "aq40",
  "bwl",
  "mc",
  "naxxramas",
  "onyxia",
  "zg",
] as const;

export type ItemInstance = (typeof ITEM_INSTANCES)[number];

export interface ItemMapping {
  id: number;
  name: string;
  equipslot: EquipSlot;
  quality: ItemQuality;
  ilvl: number;
  from: string;
  instance: ItemInstance;
}

// ============================================================================
// Internal loading functions and cache
// ============================================================================

/**
 * Cache for loaded instance items to avoid re-importing
 */
const instanceCache = new Map<string, Record<number, ItemMapping>>();

/**
 * Load items for a specific instance identifier
 * Uses dynamic import to load the JSON file on-demand
 */
async function loadInstanceItems(
  instance: string,
): Promise<Record<number, ItemMapping>> {
  // Check cache first
  if (instanceCache.has(instance)) {
    return instanceCache.get(instance)!;
  }

  try {
    // Dynamic import of the JSON file
    // This ensures proper code splitting and tree-shaking
    const module = await import(`./item-mappings/${instance}.json`);
    const items = (module.default ?? module) as Record<number, ItemMapping>;

    // Cache the result
    instanceCache.set(instance, items);

    return items;
  } catch (error) {
    // If file doesn't exist, return empty object
    console.warn(`Failed to load items for instance "${instance}":`, error);
    const empty: Record<number, ItemMapping> = {};
    instanceCache.set(instance, empty);
    return empty;
  }
}

/**
 * Load items for all instances associated with a raid zone
 */
async function loadZoneItems(
  zone: RaidZone,
): Promise<Record<number, ItemMapping>> {
  const instances = getInstancesForZone(zone);
  const allItems: Record<number, ItemMapping> = {};

  // Load all instances for this zone in parallel
  const instancePromises = instances.map((instance) =>
    loadInstanceItems(instance),
  );
  const instanceResults = await Promise.all(instancePromises);

  // Merge all items into a single object
  for (const items of instanceResults) {
    Object.assign(allItems, items);
  }

  return allItems;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get item name by ID
 * If zone is provided, only loads items for that zone (faster)
 * If zone is not provided, searches across all instances (slower)
 */
export async function getItemNameById(
  id: number,
  zone?: RaidZone,
): Promise<string | undefined> {
  const item = await getItemById(id, zone);
  return item?.name;
}

/**
 * Get full item mapping by ID
 * If zone is provided, only loads items for that zone (faster)
 * If zone is not provided, searches across all instances (slower)
 */
export async function getItemById(
  id: number,
  zone?: RaidZone,
): Promise<ItemMapping | undefined> {
  if (zone) {
    // Load only items for the specified zone
    const items = await loadZoneItems(zone);
    return items[id];
  }

  // If no zone provided, we need to search across instances
  // This is less efficient but maintains backward compatibility
  // We search through all zone-mapped instances first (most common case)
  const { ZONE_TO_INSTANCES } = await import("./zone-instance-map");
  const allMappedInstances = Object.values(ZONE_TO_INSTANCES).flat();

  for (const instance of allMappedInstances) {
    try {
      const items = await loadInstanceItems(instance);
      if (items[id]) {
        return items[id];
      }
    } catch {
      // Continue to next instance
    }
  }

  // If not found in mapped instances, return undefined
  // Note: We only search through zone-mapped instances (Classic Era raids)
  // If you need to search all instances, consider providing a zone parameter
  return undefined;
}

/**
 * Check if an item ID exists in the mapping
 * If zone is provided, only checks items for that zone (faster)
 * If zone is not provided, checks across common instances (slower)
 */
export async function hasItemMapping(
  id: number,
  zone?: RaidZone,
): Promise<boolean> {
  const item = await getItemById(id, zone);
  return item !== undefined;
}

/**
 * Load all items for a given raid zone
 * Returns a Record mapping item ID to ItemMapping for all items in that zone
 */
export async function getAllItemsForZone(
  zone: RaidZone,
): Promise<Record<number, ItemMapping>> {
  return loadZoneItems(zone);
}

/**
 * Clear the cache (useful for testing or memory management)
 */
export function clearItemCache(): void {
  instanceCache.clear();
}
