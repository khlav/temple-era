import { describe, expect, it } from "vitest";
import { resolveSoftResZoneId, parseZoneFromEventText } from "~/lib/raid-zones";

describe("resolveSoftResZoneId", () => {
  it("returns the instance id when it's a recognized raid zone", () => {
    expect(resolveSoftResZoneId("mc", [])).toBe("mc");
  });

  it("falls back through instances when instance is null", () => {
    expect(resolveSoftResZoneId(null, ["some-dungeon", "bwl"])).toBe("bwl");
  });

  it("falls back through instances when instance isn't a recognized raid zone", () => {
    expect(resolveSoftResZoneId("some-dungeon", ["aq20"])).toBe("aq20");
  });

  it("returns null when nothing resolves", () => {
    expect(resolveSoftResZoneId("some-dungeon", ["another-dungeon"])).toBeNull();
    expect(resolveSoftResZoneId(null, undefined)).toBeNull();
  });
});

describe("parseZoneFromEventText", () => {
  it("matches a zone name in the title", () => {
    expect(parseZoneFromEventText("Molten Core Clear - Tuesday", undefined)).toBe("Molten Core");
  });

  it("is case-insensitive", () => {
    expect(parseZoneFromEventText("blackwing lair progression", undefined)).toBe("Blackwing Lair");
  });

  it("falls back to channelName when title has no match", () => {
    expect(parseZoneFromEventText("Raid Night", "onyxia-signups")).toBe("Onyxia");
  });

  it("prefers title over channelName when both match different zones", () => {
    expect(parseZoneFromEventText("Naxxramas Farm", "aq40-signups")).toBe("Naxxramas");
  });

  it("returns undefined when neither field matches a known zone", () => {
    expect(parseZoneFromEventText("Alt Run", "general")).toBeUndefined();
  });

  it("returns undefined for null/undefined input", () => {
    expect(parseZoneFromEventText(null, undefined)).toBeUndefined();
  });
});
