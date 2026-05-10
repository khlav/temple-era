// src/server/api/v2/types/enums.ts
import { builder } from "../builder";

const RAID_ZONE_VALUES = [
  "NAXXRAMAS",
  "TEMPLE_OF_AHN_QIRAJ",
  "BLACKWING_LAIR",
  "MOLTEN_CORE",
  "ONYXIA",
  "RUINS_OF_AHN_QIRAJ",
  "ZUL_GURUB",
] as const;

export type RaidZoneValues = (typeof RAID_ZONE_VALUES)[number];

export const RaidZoneEnum = builder.enumType("RaidZone", {
  values: RAID_ZONE_VALUES,
});

export const AttendanceStatusEnum = builder.enumType("AttendanceStatus", {
  values: ["ATTENDED", "BENCH", "ABSENT"] as const,
});

export const CharacterTypeEnum = builder.enumType("CharacterType", {
  values: ["ALL", "PRIMARY", "SECONDARY"] as const,
});

/** Maps GraphQL enum values to the zone strings stored in the DB */
export const GQL_ZONE_TO_DB: Record<string, string> = {
  NAXXRAMAS: "Naxxramas",
  TEMPLE_OF_AHN_QIRAJ: "Temple of Ahn'Qiraj",
  BLACKWING_LAIR: "Blackwing Lair",
  MOLTEN_CORE: "Molten Core",
  ONYXIA: "Onyxia",
  RUINS_OF_AHN_QIRAJ: "Ruins of Ahn'Qiraj",
  ZUL_GURUB: "Zul'Gurub",
};

/** Maps DB zone strings to GraphQL enum values */
export const DB_ZONE_TO_GQL: Record<string, string> = Object.fromEntries(
  Object.entries(GQL_ZONE_TO_DB).map(([gql, db]) => [db, gql]),
);

/** All GQL zone enum values, used when no zone filter is specified */
export const ALL_GQL_ZONES = Object.keys(GQL_ZONE_TO_DB);
