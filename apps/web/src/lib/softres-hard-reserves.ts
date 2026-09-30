import type { RaidZone } from "~/lib/raid-zones";

/**
 * Item ids the guild hard-reserves on every SR it creates, per zone.
 *
 * A hard reserve makes an item un-soft-reservable: SoftRes shows it struck through and refuses
 * it in a reserve. Raid leads previously added these by hand in the SoftRes admin UI on every
 * raid, so a forgotten one left a guild-reserved item open to whoever SR'd it first.
 *
 * Item ids and their zones come from `~/lib/item-mappings/{mc,bwl,...}.json`, which is also what
 * `__tests__/softres-hard-reserves.test.ts` validates every entry against — SoftRes rejects the
 * whole `hardReserve` call with a 422 if any item isn't available in that raid's instance, so a
 * misfiled id would silently leave a raid with *no* hard reserves rather than a partial set.
 *
 * Zones with no entry get no hard reserves; there is no "all zones" list on purpose, since every
 * id has to be valid for the instance it's sent to.
 */
export const HARD_RESERVE_ITEM_IDS: Partial<Record<RaidZone, readonly number[]>> = {
  "Molten Core": [
    17010, // Fiery Core
    17011, // Lava Core
    17203, // Sulfuron Ingot
    18563, // Bindings of the Windseeker (Baron Geddon) — the two halves share one name
    18564, // Bindings of the Windseeker (Garr)
    17204, // Eye of Sulfuras
    19017, // Essence of the Firelord
  ],
  "Blackwing Lair": [
    18562, // Elementium Ore
  ],
};

/**
 * The hard-reserve list for a zone, or an empty array when that zone has none.
 */
export function getHardReserveItemIds(zone: RaidZone): readonly number[] {
  return HARD_RESERVE_ITEM_IDS[zone] ?? [];
}
