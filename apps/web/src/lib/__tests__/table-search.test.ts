import { describe, it, expect } from "vitest";
import { matchesSearchQuery, normalizeSearchText, parseSearchQuery } from "../table-search";

describe("normalizeSearchText", () => {
  it("lowercases and strips accents/non-ASCII", () => {
    expect(normalizeSearchText("Élan Ashkandi")).toBe("elan ashkandi");
  });
});

describe("parseSearchQuery", () => {
  it("splits plain terms as positive terms", () => {
    expect(parseSearchQuery("warrior fire")).toEqual({
      positiveTerms: ["warrior", "fire"],
      orGroups: [],
      negativeTerms: [],
    });
  });

  it("parses -term as a negative term", () => {
    expect(parseSearchQuery("warrior -bank")).toEqual({
      positiveTerms: ["warrior"],
      orGroups: [],
      negativeTerms: ["bank"],
    });
  });

  it("parses -(term1 term2) as grouped negative terms", () => {
    expect(parseSearchQuery("-(ashkandi windseeker)")).toEqual({
      positiveTerms: [],
      orGroups: [],
      negativeTerms: ["ashkandi", "windseeker"],
    });
  });

  it("parses term1|term2 as an OR group", () => {
    expect(parseSearchQuery("warrior|mage")).toEqual({
      positiveTerms: [],
      orGroups: [["warrior", "mage"]],
      negativeTerms: [],
    });
  });

  it("ignores a bare '-' term", () => {
    expect(parseSearchQuery("warrior -")).toEqual({
      positiveTerms: ["warrior"],
      orGroups: [],
      negativeTerms: [],
    });
  });

  it("preserves original casing and accents (server builds a case-insensitive but not accent-folding SQL ILIKE from these terms directly)", () => {
    expect(parseSearchQuery("Élan WARRIOR")).toEqual({
      positiveTerms: ["Élan", "WARRIOR"],
      orGroups: [],
      negativeTerms: [],
    });
  });
});

describe("matchesSearchQuery", () => {
  it("matches everything for an empty query", () => {
    expect(matchesSearchQuery("Anything at all", "")).toBe(true);
    expect(matchesSearchQuery("Anything at all", "   ")).toBe(true);
  });

  it("ANDs multiple positive terms across the whole haystack", () => {
    const haystack = "Molten Core mc raid attendance";
    expect(matchesSearchQuery(haystack, "molten attendance")).toBe(true);
    expect(matchesSearchQuery(haystack, "molten missing")).toBe(false);
  });

  it("excludes rows matching a negative term", () => {
    const haystack = "Ashkandi Windseeker warrior";
    expect(matchesSearchQuery(haystack, "warrior -bank")).toBe(true);
    expect(matchesSearchQuery(haystack, "warrior -ashkandi")).toBe(false);
  });

  it("excludes rows matching any grouped negative term", () => {
    const haystack = "Ashkandi Windseeker warrior";
    expect(matchesSearchQuery(haystack, "-(bank alliance)")).toBe(true);
    expect(matchesSearchQuery(haystack, "-(bank windseeker)")).toBe(false);
  });

  it("matches OR groups against any alternative", () => {
    expect(matchesSearchQuery("A fire mage", "warrior|mage")).toBe(true);
    expect(matchesSearchQuery("A frost mage", "warrior|priest")).toBe(false);
  });

  it("requires every OR group to have a match when combined with AND terms", () => {
    const haystack = "Naxxramas fire mage raid";
    expect(matchesSearchQuery(haystack, "naxxramas warrior|mage")).toBe(true);
    expect(matchesSearchQuery(haystack, "naxxramas warrior|priest")).toBe(false);
  });

  it("is accent- and case-insensitive on both sides", () => {
    expect(matchesSearchQuery("Élan", "elan")).toBe(true);
    expect(matchesSearchQuery("elan", "ÉLAN")).toBe(true);
    expect(matchesSearchQuery("Élan", "ÉLAN")).toBe(true);
  });

  it("does not let a negative term that normalizes to empty exclude everything", () => {
    // "中文" is entirely non-ASCII, so it normalizes to "" — it must be dropped rather
    // than making "".includes("") == true wipe out every row.
    expect(matchesSearchQuery("Ashkandi warrior", "-中文")).toBe(true);
  });

  it("does not let an OR group that normalizes to empty force a match", () => {
    expect(matchesSearchQuery("Ashkandi warrior", "warrior 中文|日本語")).toBe(true);
  });

  it("still ANDs a real term alongside one that normalizes to empty", () => {
    expect(matchesSearchQuery("Ashkandi warrior", "中文 mage")).toBe(false);
    expect(matchesSearchQuery("Ashkandi warrior", "中文 warrior")).toBe(true);
  });

  it("treats a wholly-unsupported positive query as no match, not as an empty query", () => {
    // Unlike an actually-empty query, the user expressed positive intent here — showing
    // every row unfiltered would look like the search silently did nothing.
    expect(matchesSearchQuery("Ashkandi warrior", "中文")).toBe(false);
    expect(matchesSearchQuery("Ashkandi warrior", "中文|日本語")).toBe(false);
  });
});
