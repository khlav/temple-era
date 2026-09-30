import { describe, expect, it } from "vitest";
import { HARD_RESERVE_ITEM_IDS, getHardReserveItemIds } from "~/lib/softres-hard-reserves";
import { getAllItemsForZone } from "~/lib/item-mappings";
import { RAID_ZONES, type RaidZone } from "~/lib/raid-zones";
import { SOFTRES_CREATE_INSTANCE_IDS } from "~/lib/softres-create-instance-ids";

const configuredZones = Object.keys(HARD_RESERVE_ITEM_IDS) as RaidZone[];

describe("HARD_RESERVE_ITEM_IDS", () => {
  it("only names zones this app can actually create an SR for", () => {
    for (const zone of configuredZones) {
      expect(RAID_ZONES).toContain(zone);
      expect(SOFTRES_CREATE_INSTANCE_IDS[zone]).toBeTypeOf("number");
    }
  });

  it("lists no item twice within a zone", () => {
    for (const zone of configuredZones) {
      const ids = getHardReserveItemIds(zone);
      expect(new Set(ids).size, `${zone} has a duplicate item id`).toBe(ids.length);
    }
  });

  // SoftRes rejects the whole hardReserve POST with a 422 if any single id isn't available in
  // that raid's instance, which would leave the SR with NO hard reserves rather than a partial
  // set — so one misfiled id silently disarms its entire zone.
  it.each(configuredZones)("only lists items that actually drop in %s", async (zone) => {
    const zoneItems = await getAllItemsForZone(zone);
    for (const id of getHardReserveItemIds(zone)) {
      expect(zoneItems[id], `item ${id} is not in ${zone}'s item mapping`).toBeDefined();
    }
  });

  it("hard-reserves both halves of the Bindings of the Windseeker in Molten Core", async () => {
    const mcItems = await getAllItemsForZone("Molten Core");
    const bindings = Object.values(mcItems).filter(
      (item) => item.name === "Bindings of the Windseeker",
    );

    // Two distinct ids sharing one name (Baron Geddon's and Garr's halves) — the reason this is
    // asserted rather than assumed is that reading the list by name alone loses one of them.
    expect(bindings).toHaveLength(2);
    for (const binding of bindings) {
      expect(getHardReserveItemIds("Molten Core")).toContain(binding.id);
    }
  });

  // Deliberately no "every legendary drop is hard-reserved" assertion. An earlier revision had
  // one, which made the list look derivable from item quality; it isn't. It's a guild policy
  // list, and MC's Eye of Sulfuras and Essence of the Firelord are legendary but intentionally
  // left off — a rule-shaped test would have to be deleted again the next time policy moves.
  it("is a policy list, not one derived from item quality", async () => {
    const mcItems = await getAllItemsForZone("Molten Core");
    const mcLegendaryIds = Object.values(mcItems)
      .filter((item) => item.quality === "Legendary")
      .map((item) => item.id);
    const reserved = getHardReserveItemIds("Molten Core");

    // Some MC legendaries are reserved (the Bindings) and some are not, so quality alone
    // predicts nothing.
    expect(mcLegendaryIds.some((id) => reserved.includes(id))).toBe(true);
    expect(mcLegendaryIds.some((id) => !reserved.includes(id))).toBe(true);
  });
});

describe("getHardReserveItemIds", () => {
  it("returns the configured list for a zone that has one", () => {
    expect(getHardReserveItemIds("Blackwing Lair")).toEqual([18562]);
  });

  // Exact, not arrayContaining: the point is that an item can't be added or dropped without
  // this failing, so a policy change has to be deliberate — and paired with the list in
  // agent/skills/temple-features/SKILL.md, which is what Templar tells raiders is reserved.
  it("reserves exactly the four policy items in Molten Core", () => {
    expect(getHardReserveItemIds("Molten Core")).toEqual([17010, 17011, 18563, 18564]);
  });

  it("returns an empty list for a zone with no hard reserves", () => {
    expect(getHardReserveItemIds("Naxxramas")).toEqual([]);
  });
});
