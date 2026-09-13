import { describe, expect, it } from "vitest";
import { parseZonesFromEventTitle } from "~/lib/softres-doubleheader-parser";

describe("parseZonesFromEventTitle", () => {
  it("splits a doubleheader title into its zones (BWL/MC)", () => {
    expect(parseZonesFromEventTitle("Sunday BWL/MC @7PM", undefined)).toEqual([
      "Blackwing Lair",
      "Molten Core",
    ]);
  });

  it("parses a ZG/AQ20 doubleheader title", () => {
    expect(parseZonesFromEventTitle("Saturday ZG/AQ20 @10:30", undefined)).toEqual([
      "Zul'Gurub",
      "Ruins of Ahn'Qiraj",
    ]);
  });

  it("parses a solo AQ40 title", () => {
    expect(parseZonesFromEventTitle("Monday AQ40 @8PM", undefined)).toEqual([
      "Temple of Ahn'Qiraj",
    ]);
  });

  it("parses a solo Onyxia title", () => {
    expect(parseZonesFromEventTitle("Thursday Onyxia", undefined)).toEqual(["Onyxia"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(parseZonesFromEventTitle("Guild Meeting @9PM", undefined)).toEqual([]);
  });

  it("returns an empty array for null/undefined title and channelName", () => {
    expect(parseZonesFromEventTitle(null, undefined)).toEqual([]);
  });

  it("falls back to channelName when title matches nothing", () => {
    expect(parseZonesFromEventTitle("Raid Night", "BWL/MC")).toEqual([
      "Blackwing Lair",
      "Molten Core",
    ]);
  });

  it("prefers title over channelName when title matches", () => {
    expect(parseZonesFromEventTitle("Thursday Onyxia", "BWL/MC")).toEqual(["Onyxia"]);
  });

  it("de-duplicates repeated zone mentions within one text", () => {
    expect(parseZonesFromEventTitle("MC and MC again", undefined)).toEqual(["Molten Core"]);
  });
});
