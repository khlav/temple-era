/**
 * The guild emoji name for each raid zone, keyed by the zone display name that `create-softres`
 * and `ensure-softres` return (apps/web's `RAID_ZONE_CONFIG`). The bot uploads these emoji at
 * startup; the web app looks them up by these same names, so the two cannot disagree.
 */
export const ZONE_EMOJI_NAMES: Record<string, string> = {
  "Molten Core": "mc_ragnaros",
  "Blackwing Lair": "bwl_nefarian",
  "Temple of Ahn'Qiraj": "aq40_cthun",
  Naxxramas: "naxx_kelthuzad",
  Onyxia: "ony_onyxia",
  "Zul'Gurub": "zg_hakkar",
  "Ruins of Ahn'Qiraj": "aq20_ossirian",
};
