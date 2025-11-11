/**
 * Available raid zones from the database
 * Ordered alphabetically for consistency
 */
export const RAID_ZONES = [
  "Blackwing Lair",
  "Molten Core",
  "Naxxramas",
  "Onyxia",
  "Ruins of Ahn'Qiraj",
  "Temple of Ahn'Qiraj",
  "Zul'Gurub",
] as const;

export type RaidZone = (typeof RAID_ZONES)[number];
