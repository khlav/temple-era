import { describe, expect, it } from "vitest";
import { isResolvedParticipant, partitionParticipants } from "~/lib/wcl-participants";

const peazie = {
  characterId: 72736669,
  name: "Peazie",
  class: "Mage",
  classDetail: "Mage-Fire",
  server: "Mankrik",
};

// What WCL produced for Peazie in the 2026-11-01 clean-up log.
const unnamedPeazie = {
  characterId: 72736669,
  name: "nil",
  class: "Unknown",
  classDetail: "Unknown",
  server: null as unknown as string,
};

describe("isResolvedParticipant", () => {
  it("accepts a fully known player", () => {
    expect(isResolvedParticipant(peazie)).toBe(true);
  });

  it("rejects WCL's unnamed placeholder and an empty actor", () => {
    expect(isResolvedParticipant(unnamedPeazie)).toBe(false);
    expect(isResolvedParticipant({})).toBe(false);
  });
});

describe("partitionParticipants", () => {
  it("separates real attendees from unnamed placeholders, and drops entries with no id", () => {
    const other = { ...peazie, characterId: 1, name: "Waffle" };
    expect(partitionParticipants([other, unnamedPeazie, {}])).toEqual({
      resolved: [other],
      unresolvedIds: [72736669],
    });
  });
});
