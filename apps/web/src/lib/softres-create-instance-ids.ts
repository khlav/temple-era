import type { RaidZone } from "~/lib/raid-zones";

/**
 * SoftRes's numeric classic-edition instance ids, for the raid-creation POST body only.
 *
 * A different id space from `RAID_ZONE_CONFIG`'s string slugs (`"mc"`, `"bwl"`, ...), which are
 * for the *read* endpoint (`GET /api/raid/{id}`). Kept as a separate table here rather than
 * folded into `raid-zones.ts` to avoid conflating two different SoftRes id spaces that happen to
 * share a name. Sourced directly from SoftRes's own public homepage payload
 * (`instances.classic` in the Inertia `data-page` JSON at https://softres.it/), confirmed live
 * during this project's interview.
 */
export const SOFTRES_CREATE_INSTANCE_IDS: Record<RaidZone, number> = {
  Onyxia: 1,
  "Molten Core": 2,
  "Blackwing Lair": 3,
  "Zul'Gurub": 4,
  "Ruins of Ahn'Qiraj": 5,
  "Temple of Ahn'Qiraj": 6,
  Naxxramas: 7,
};
