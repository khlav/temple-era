/**
 * Available raid zones from the database
 * Ordered alphabetically for consistency
 *
 * This is the single source of truth for raid zones and their instance mappings.
 * All zone-related exports are derived from RAID_ZONE_CONFIG.
 */

/**
 * Zone configuration: defines both zone names and their corresponding instance identifiers
 */
export const RAID_ZONE_CONFIG = [
  { name: "Blackwing Lair", instance: "bwl" },
  { name: "Molten Core", instance: "mc" },
  { name: "Naxxramas", instance: "naxxramas" },
  { name: "Onyxia", instance: "onyxia" },
  { name: "Ruins of Ahn'Qiraj", instance: "aq20" },
  { name: "Temple of Ahn'Qiraj", instance: "aq40" },
  { name: "Zul'Gurub", instance: "zg" },
] as const;

/**
 * Sentinel value for zone-less / custom plans (no database migration needed)
 */
export const CUSTOM_ZONE_ID = "custom";
export const CUSTOM_ZONE_DISPLAY_NAME = "Custom";
export const ZONE_BADGE_COMPACT_CLASSES =
  "shrink-0 px-1.5 py-0.5 text-[10px] leading-none tracking-[0.12em]";
export const ZONE_ACCENT_CLASSES: Record<string, string> = {
  naxxramas: "bg-emerald-500/12 border-emerald-400/35 text-emerald-300",
  aq40: "bg-sky-500/12 border-sky-400/35 text-sky-300",
  bwl: "bg-red-500/12 border-red-400/35 text-red-300",
  mc: "bg-orange-500/12 border-orange-300/40 text-orange-200",
  onyxia: "bg-slate-500/12 border-slate-400/35 text-slate-300",
  aq20: "bg-teal-500/12 border-teal-400/35 text-teal-300",
  zg: "bg-lime-500/12 border-lime-400/35 text-lime-300",
  custom: "bg-slate-500/12 border-slate-400/35 text-slate-300",
};

export function getInstanceIdForZoneName(zoneName: string | null | undefined) {
  if (!zoneName) return undefined;
  return RAID_ZONE_CONFIG.find((zone) => zone.name === zoneName)?.instance;
}

/**
 * Array of raid zone names (derived from RAID_ZONE_CONFIG)
 */
export const RAID_ZONES = RAID_ZONE_CONFIG.map(
  (z) => z.name,
) as readonly string[];

/**
 * Type for raid zone names
 */
export type RaidZone = (typeof RAID_ZONES)[number];

/**
 * Maps raid zones to their corresponding instance identifiers from softres.it
 * Each zone maps to a single Classic Era instance identifier
 */
export const ZONE_TO_INSTANCES: Record<RaidZone, string[]> = Object.fromEntries(
  RAID_ZONE_CONFIG.map((z) => [z.name, [z.instance]]),
) as Record<RaidZone, string[]>;

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
