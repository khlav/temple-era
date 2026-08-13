// Fixed catalog of world-buff turn-in items and the buff each one grants. Not modeled as a DB
// table — this list is small, stable, and only used for grouping/labeling in the UI. Item and
// buff are NOT 1:1: Onyxia's Head and Nefarian's Head are two separate one-time turn-ins that
// both grant Dragon, so tracking stays at item granularity (see world-buff-schema.ts).

export const WORLD_BUFF_ITEM = {
  RENDS_HEAD: "rends_head",
  ONYXIAS_HEAD: "onyxias_head",
  NEFARIANS_HEAD: "nefarians_head",
  HAKKARS_HEART: "hakkars_heart",
} as const;

export type WorldBuffItem = (typeof WORLD_BUFF_ITEM)[keyof typeof WORLD_BUFF_ITEM];

export const WORLD_BUFF_ITEMS = [
  WORLD_BUFF_ITEM.RENDS_HEAD,
  WORLD_BUFF_ITEM.ONYXIAS_HEAD,
  WORLD_BUFF_ITEM.NEFARIANS_HEAD,
  WORLD_BUFF_ITEM.HAKKARS_HEART,
] as const;

export const WORLD_BUFF_ITEM_LABELS: Record<WorldBuffItem, string> = {
  rends_head: "Rend Blackhand's Head",
  onyxias_head: "Onyxia's Head",
  nefarians_head: "Nefarian's Head",
  hakkars_heart: "Hakkar's Heart",
};

export const WORLD_BUFF = {
  REND: "rend",
  DRAGON: "dragon",
  ZG: "zg",
} as const;

export type WorldBuff = (typeof WORLD_BUFF)[keyof typeof WORLD_BUFF];

export const WORLD_BUFFS = [WORLD_BUFF.REND, WORLD_BUFF.DRAGON, WORLD_BUFF.ZG] as const;

// Horde-side buff names (Temple is a Horde guild) — the Alliance equivalents differ.
export const WORLD_BUFF_LABELS: Record<WorldBuff, string> = {
  rend: "Warchief's Blessing",
  dragon: "Rallying Cry of the Dragonslayer",
  zg: "Spirit of Zandalar",
};

// Standing raid-night turn-in time per buff, in Eastern time — the default the schedule dialog
// prefills once a buff is picked (see world-buff-schedule-defaults.ts).
export const WORLD_BUFF_DEFAULT_TIME_ET: Record<WorldBuff, { hour: number; minute: number }> = {
  zg: { hour: 18, minute: 55 },
  dragon: { hour: 19, minute: 0 },
  rend: { hour: 19, minute: 0 },
};

export const WORLD_BUFF_BY_ITEM: Record<WorldBuffItem, WorldBuff> = {
  rends_head: WORLD_BUFF.REND,
  onyxias_head: WORLD_BUFF.DRAGON,
  nefarians_head: WORLD_BUFF.DRAGON,
  hakkars_heart: WORLD_BUFF.ZG,
};

// Classic WoW spell IDs for each buff's own icon (not the turn-in item's icon), used with
// `~/components/ui/aa-icons`'s `SpellIcon` to render the Wowhead-hosted texture.
export const WORLD_BUFF_SPELL_ID: Record<WorldBuff, number> = {
  rend: 16609, // Warchief's Blessing
  dragon: 22888, // Rallying Cry of the Dragonslayer
  zg: 24425, // Spirit of Zandalar
};

// Per-item icon override, checked before falling back to the shared buff icon above — lets
// Onyxia's Head and Nefarian's Head (both grant Dragon) show visually distinct icons instead of
// the identical buff texture. Drop a file at the referenced path under `public/` and it's picked
// up automatically by `~/components/world-buffs/world-buff-icon`; entries with no file on disk
// fall through to the buff icon exactly as before.
export const WORLD_BUFF_ITEM_ICON_OVERRIDE: Partial<Record<WorldBuffItem, string>> = {
  onyxias_head: "/img/world-buffs/onyxias-head.png",
};
