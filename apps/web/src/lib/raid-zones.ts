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
  naxxramas: "bg-zone-naxx-bg/12 border-zone-naxx-border/35 text-zone-naxx-text",
  aq40: "bg-zone-aq40-bg/12 border-zone-aq40-border/35 text-zone-aq40-text",
  bwl: "bg-zone-bwl-bg/12 border-zone-bwl-border/35 text-zone-bwl-text",
  mc: "bg-zone-mc-bg/12 border-zone-mc-border/40 text-zone-mc-text",
  onyxia: "bg-zone-ony-bg/12 border-zone-ony-border/35 text-zone-ony-text",
  aq20: "bg-zone-aq20-bg/12 border-zone-aq20-border/35 text-zone-aq20-text",
  zg: "bg-zone-zg-bg/12 border-zone-zg-border/35 text-zone-zg-text",
  custom: "bg-slate-500/12 border-slate-400/35 text-slate-300",
};

/**
 * Stronger, "selected toggle" fill per zone — same border/text hue as ZONE_ACCENT_CLASSES but a
 * full-opacity border and a heavier bg tint, for OR-filter toggle controls (dashboard's
 * RaidsListCard zone tiles, /raids' zone FilterRail) where the active state needs to read as
 * "filled with this zone's color", not just a light badge tint.
 */
export const ZONE_ACTIVE_ACCENT_CLASSES: Record<string, string> = {
  naxxramas: "text-zone-naxx-text border-zone-naxx-border bg-zone-naxx-bg/25",
  aq40: "text-zone-aq40-text border-zone-aq40-border bg-zone-aq40-bg/25",
  bwl: "text-zone-bwl-text border-zone-bwl-border bg-zone-bwl-bg/25",
  mc: "text-zone-mc-text border-zone-mc-border bg-zone-mc-bg/25",
  zg: "text-zone-zg-text border-zone-zg-border bg-zone-zg-bg/25",
  aq20: "text-zone-aq20-text border-zone-aq20-border bg-zone-aq20-bg/25",
  onyxia: "text-zone-ony-text border-zone-ony-border bg-zone-ony-bg/25",
};

export function getInstanceIdForZoneName(zoneName: string | null | undefined) {
  if (!zoneName) return undefined;
  return RAID_ZONE_CONFIG.find((zone) => zone.name === zoneName)?.instance;
}

/**
 * Short pill label per zone instance, per the redesign pattern spec's zone badge set
 * (NAXX / AQ40 / BWL / MC / ZG / ONY / AQ20) — the only zone whose label isn't just
 * `instance.toUpperCase()` is Onyxia ("ONY", not "ONYXIA").
 */
export const ZONE_BADGE_LABELS: Record<string, string> = {
  naxxramas: "NAXX",
  aq40: "AQ40",
  bwl: "BWL",
  mc: "MC",
  zg: "ZG",
  onyxia: "ONY",
  aq20: "AQ20",
};

/**
 * Array of raid zone names (derived from RAID_ZONE_CONFIG)
 */
export const RAID_ZONES = RAID_ZONE_CONFIG.map((z) => z.name) as readonly string[];

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

/**
 * Resolve a SoftRes raid's instance identifier to a short zone id (e.g. "bwl", "aq40"),
 * falling back through the `instances` array when `instance` itself isn't set or isn't a
 * recognized raid zone. Moved here from raid-helper.ts (TEMPLE-84) so it can also back
 * signup-snapshot zone resolution (~/server/services/raid-helper-snapshot-capture)
 * without that service importing from a tRPC router file.
 */
export function resolveSoftResZoneId(
  instance: string | null,
  instances: string[] | undefined,
): string | null {
  if (instance && isRaidZoneInstance(instance)) return instance;
  for (const candidate of instances ?? []) {
    if (isRaidZoneInstance(candidate)) return candidate;
  }
  return null;
}

/**
 * Best-effort zone guess from free-text Raid Helper event fields (title, channel name),
 * for when no SoftRes link is available to resolve zone from structured data instead
 * (see resolveSoftResZoneId — strongly prefer that path when possible). Case-insensitive
 * substring match against each configured zone's full name; title is checked before
 * channelName since it's the more deliberately-authored field.
 *
 * Deliberately naive: a literal substring match against the full zone name (e.g.
 * "Zul'Gurub") won't catch common hyphenated/abbreviated channel-naming conventions
 * (e.g. "#zul-gurub", "#zg-raid"). This is the acknowledged lower-trust fallback tier —
 * revisit with real title/channel samples once this has run against production data
 * rather than guessing at conventions up front.
 */
export function parseZoneFromEventText(
  title: string | null | undefined,
  channelName: string | null | undefined,
): RaidZone | undefined {
  for (const text of [title, channelName]) {
    if (!text) continue;
    const lowerText = text.toLowerCase();
    const match = RAID_ZONE_CONFIG.find((zone) => lowerText.includes(zone.name.toLowerCase()));
    if (match) return match.name;
  }
  return undefined;
}
