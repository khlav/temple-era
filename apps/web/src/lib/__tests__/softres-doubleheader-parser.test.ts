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

  it("matches full Ahn'Qiraj zone names, not just the AQ20/AQ40 abbreviations", () => {
    expect(parseZonesFromEventTitle("Sunday Ruins of Ahn'Qiraj", undefined)).toEqual([
      "Ruins of Ahn'Qiraj",
    ]);
    expect(parseZonesFromEventTitle("Temple of Ahn'Qiraj @8PM", undefined)).toEqual([
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

  describe("one-typo tolerance", () => {
    it("recovers the AQ20 half of the doubleheader title that lost its SR", () => {
      // The real title behind the 2026-11-22 miss: "AG20" matched nothing, so only ZG got an SR.
      expect(parseZonesFromEventTitle("Saturday ZG/AG20 @ 6:00PM", undefined)).toEqual([
        "Zul'Gurub",
        "Ruins of Ahn'Qiraj",
      ]);
    });

    it("tolerates one edit of any kind in an abbreviation", () => {
      expect(parseZonesFromEventTitle("Monday AQ4O @8PM", undefined)).toEqual([
        "Temple of Ahn'Qiraj",
      ]);
      expect(parseZonesFromEventTitle("Tuesday Nax @8pm", undefined)).toEqual(["Naxxramas"]);
      expect(parseZonesFromEventTitle("Friday BWWL @9:30pm", undefined)).toEqual([
        "Blackwing Lair",
      ]);
    });

    it("refuses to guess when a word sits one edit from two different zones", () => {
      // "AQ30" is one edit from both AQ20 and AQ40 — an SR for the wrong raid is worse than none.
      expect(parseZonesFromEventTitle("Monday AQ30 @8PM", undefined)).toEqual([]);
    });

    it("does not fuzzy-match two-letter abbreviations", () => {
      // Every short word in a title is one edit from "mc"/"zg"; only an exact match counts.
      expect(parseZonesFromEventTitle("Sunday ME @7PM", undefined)).toEqual([]);
      expect(parseZonesFromEventTitle("Sunday ZX @7PM", undefined)).toEqual([]);
    });

    it("leaves unrelated titles alone", () => {
      expect(parseZonesFromEventTitle("Guild Meeting @9PM", undefined)).toEqual([]);
      expect(parseZonesFromEventTitle("Sapph/KT Cleanup 9:45PM", undefined)).toEqual([]);
      expect(parseZonesFromEventTitle("Wednesday ZG @ 8pm", undefined)).toEqual(["Zul'Gurub"]);
      expect(parseZonesFromEventTitle("Naxx {eventtime#E MM/dd}", undefined)).toEqual([
        "Naxxramas",
      ]);
    });

    it("only fuzzy-matches a whole word, never a near miss inside a longer one", () => {
      // "bowl" is one edit from "bwl"; "Bowling" is not, so a longer word stays unmatched.
      expect(parseZonesFromEventTitle("Tuesday Bowling Night", undefined)).toEqual([]);
    });
  });
});
