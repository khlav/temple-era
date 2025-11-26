import { type RaidZone } from "./raid-zones";

/**
 * Maps raid zones to their corresponding instance identifiers from softres.it
 * Each zone maps to a single Classic Era instance identifier
 */
export const ZONE_TO_INSTANCES: Record<RaidZone, string[]> = {
  "Blackwing Lair": ["bwl"],
  "Molten Core": ["mc"],
  Naxxramas: ["naxxramas"],
  Onyxia: ["onyxia"],
  "Ruins of Ahn'Qiraj": ["aq20"],
  "Temple of Ahn'Qiraj": ["aq40"],
  "Zul'Gurub": ["zg"],
} as const;

/**
 * Reverse mapping: instance identifier to raid zone
 */
export const INSTANCE_TO_ZONE: Record<string, RaidZone> = {};

// Build reverse mapping
for (const [zone, instances] of Object.entries(ZONE_TO_INSTANCES)) {
  for (const instance of instances) {
    INSTANCE_TO_ZONE[instance] = zone as RaidZone;
  }
}

/**
 * Get all instance identifiers for a given raid zone
 */
export function getInstancesForZone(zone: RaidZone): string[] {
  return ZONE_TO_INSTANCES[zone] ?? [];
}

/**
 * Get the raid zone for a given instance identifier
 */
export function getZoneForInstance(instance: string): RaidZone | undefined {
  return INSTANCE_TO_ZONE[instance];
}

/**
 * Check if an instance belongs to any of the defined raid zones
 */
export function isRaidZoneInstance(instance: string): boolean {
  return instance in INSTANCE_TO_ZONE;
}
