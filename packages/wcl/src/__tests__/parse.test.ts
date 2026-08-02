import { describe, expect, it } from "vitest";

import {
  buildReportUrl,
  createWclUrlRegex,
  extractReportId,
  extractWarcraftLogsUrls,
} from "../parse.js";

/** A valid report code: exactly 16 alphanumeric characters. */
const ID = "bmThXYVCxyFPARta";
const OTHER_ID = "aaaaBBBBccccDDDD";

const canonical = (id: string) => `https://vanilla.warcraftlogs.com/reports/${id}`;

describe("extractWarcraftLogsUrls — host variants", () => {
  /*
   * This block is the reason the package exists. Before consolidation the two callers
   * disagreed about which hosts count:
   *
   *   apps/bot/src/services/wclDetector.ts   /(?:(?:vanilla|classic|www)\.)?warcraftlogs\.com/
   *   apps/web/src/server/api/discord-helpers.ts  /(?:vanilla|classic)\.warcraftlogs\.com/
   *
   * The bot's optional-subdomain form was a deliberate patch; the web's was never updated,
   * so the website silently ignored any log posted as www. or as a bare domain. The union
   * wins — dropping a real report is the worse failure.
   */
  it.each([
    ["vanilla subdomain", `https://vanilla.warcraftlogs.com/reports/${ID}`],
    ["classic subdomain", `https://classic.warcraftlogs.com/reports/${ID}`],
    [
      "www subdomain — web rejected this before consolidation",
      `https://www.warcraftlogs.com/reports/${ID}`,
    ],
    [
      "no subdomain — web rejected this before consolidation",
      `https://warcraftlogs.com/reports/${ID}`,
    ],
    ["plain http", `http://vanilla.warcraftlogs.com/reports/${ID}`],
  ])("accepts %s", (_label, input) => {
    expect(extractWarcraftLogsUrls(input)).toEqual([canonical(ID)]);
  });

  it("normalises every accepted host to the canonical vanilla URL", () => {
    // Both implementations already agreed on this: the matched host is discarded and the
    // URL is rebuilt from the report ID. Downstream code assumes canonical form.
    expect(extractWarcraftLogsUrls(`https://www.warcraftlogs.com/reports/${ID}`)).toEqual([
      canonical(ID),
    ]);
  });

  it.each([
    ["an unrecognised subdomain", `https://fresh.warcraftlogs.com/reports/${ID}`],
    ["a lookalike host", `https://warcraftlogs.com.evil.test/reports/${ID}`],
    ["an unrelated host", `https://evil.test/reports/${ID}`],
    ["a protocol-relative URL", `//vanilla.warcraftlogs.com/reports/${ID}`],
  ])("rejects %s", (_label, input) => {
    expect(extractWarcraftLogsUrls(input)).toEqual([]);
  });
});

describe("extractWarcraftLogsUrls — report ID validation", () => {
  it("rejects a report code shorter than 16 characters", () => {
    expect(extractWarcraftLogsUrls("https://vanilla.warcraftlogs.com/reports/tooshort")).toEqual(
      [],
    );
  });

  it("rejects a report code longer than 16 characters rather than truncating it", () => {
    // Guard-path regression. Both pre-consolidation regexes matched the first 16 characters
    // of a 17-character code and reported a report ID that does not exist, so a malformed
    // link produced a confident wrong answer instead of no answer.
    expect(extractWarcraftLogsUrls(`https://vanilla.warcraftlogs.com/reports/${ID}x`)).toEqual([]);
  });

  it("rejects a report code containing non-alphanumeric characters", () => {
    expect(
      extractWarcraftLogsUrls("https://vanilla.warcraftlogs.com/reports/bmThXYV-xyFPARta"),
    ).toEqual([]);
  });

  it("accepts a path segment after the report ID", () => {
    expect(
      extractWarcraftLogsUrls(`https://vanilla.warcraftlogs.com/reports/${ID}/fights/3`),
    ).toEqual([canonical(ID)]);
  });
});

describe("extractWarcraftLogsUrls — query strings and fragments", () => {
  it.each([
    ["a query string", `https://vanilla.warcraftlogs.com/reports/${ID}?fight=3&type=damage-done`],
    ["a fragment", `https://vanilla.warcraftlogs.com/reports/${ID}#fight=last`],
  ])("strips %s from the returned URL", (_label, input) => {
    expect(extractWarcraftLogsUrls(input)).toEqual([canonical(ID)]);
  });
});

describe("extractWarcraftLogsUrls — messages containing other text", () => {
  it("finds a URL embedded in surrounding prose", () => {
    expect(extractWarcraftLogsUrls(`logs are up: ${canonical(ID)} — gg everyone`)).toEqual([
      canonical(ID),
    ]);
  });

  it("returns every URL in the message, in order", () => {
    const content = `first ${canonical(ID)} then https://classic.warcraftlogs.com/reports/${OTHER_ID}`;
    expect(extractWarcraftLogsUrls(content)).toEqual([canonical(ID), canonical(OTHER_ID)]);
  });

  it("preserves duplicates rather than collapsing them", () => {
    // Pre-existing behaviour in both callers, kept deliberately: apps/bot reads only the
    // first URL, and changing this would alter how apps/web counts logs per message.
    expect(extractWarcraftLogsUrls(`${canonical(ID)} ${canonical(ID)}`)).toEqual([
      canonical(ID),
      canonical(ID),
    ]);
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   \n\t "],
    ["a message with no links", "who is benched tonight?"],
  ])("returns an empty array for %s", (_label, input) => {
    expect(extractWarcraftLogsUrls(input)).toEqual([]);
  });
});

describe("extractWarcraftLogsUrls — regex state", () => {
  it("returns the same result when called repeatedly", () => {
    // A module-level /g regex carries lastIndex between calls, so the second call would
    // start mid-string and miss the match. Every caller must get a fresh regex.
    const content = canonical(ID);
    expect(extractWarcraftLogsUrls(content)).toEqual([canonical(ID)]);
    expect(extractWarcraftLogsUrls(content)).toEqual([canonical(ID)]);
    expect(extractWarcraftLogsUrls(content)).toEqual([canonical(ID)]);
  });

  it("hands out a distinct regex object per createWclUrlRegex call", () => {
    const a = createWclUrlRegex();
    const b = createWclUrlRegex();
    expect(a).not.toBe(b);
    expect(a.global).toBe(true);
    a.exec(canonical(ID));
    expect(a.lastIndex).toBeGreaterThan(0);
    expect(b.lastIndex).toBe(0);
  });
});

describe("createWclUrlRegex — match spans", () => {
  /*
   * apps/web/src/components/raids/discord-warcraft-logs.tsx renders message content with
   * clickable links, so it needs match[0] and match.index rather than the rebuilt URL.
   * Its old regex ended in (?:[?#].*)? — a greedy .* that ran to the end of the line, so
   * the anchor text swallowed every word typed after the link.
   */
  it("matches only the URL, not the prose following a query string", () => {
    const content = `${canonical(ID)}?fight=3 and then we wiped`;
    const match = createWclUrlRegex().exec(content);
    expect(match?.[0]).toBe(`${canonical(ID)}?fight=3`);
  });

  it("matches only the URL, not the prose following a fragment", () => {
    const content = `${canonical(ID)}#fight=last gg`;
    const match = createWclUrlRegex().exec(content);
    expect(match?.[0]).toBe(`${canonical(ID)}#fight=last`);
  });

  it("reports the offset of the URL within the message", () => {
    const prefix = "logs: ";
    const match = createWclUrlRegex().exec(`${prefix}${canonical(ID)}`);
    expect(match?.index).toBe(prefix.length);
  });

  it("exposes the report ID as the first capture group", () => {
    expect(createWclUrlRegex().exec(canonical(ID))?.[1]).toBe(ID);
  });
});

describe("extractReportId", () => {
  it.each([
    ["a canonical URL", canonical(ID)],
    ["a classic URL", `https://classic.warcraftlogs.com/reports/${ID}`],
    ["a bare-domain URL", `https://warcraftlogs.com/reports/${ID}`],
    ["a URL with a query string", `${canonical(ID)}?fight=3`],
    ["a URL with a fragment", `${canonical(ID)}#fight=last`],
    ["a URL with a trailing path", `${canonical(ID)}/fights/3`],
  ])("extracts the report ID from %s", (_label, input) => {
    expect(extractReportId(input)).toBe(ID);
  });

  it.each([
    ["an empty string", ""],
    ["a URL with no report path", "https://vanilla.warcraftlogs.com/"],
    ["a report code that is too short", "https://vanilla.warcraftlogs.com/reports/tooshort"],
    ["a non-URL string", "not a url at all"],
  ])("returns null for %s", (_label, input) => {
    expect(extractReportId(input)).toBeNull();
  });

  it("returns null for a report code longer than 16 characters", () => {
    // Same truncation guard as extraction: apps/bot passes the result straight to the
    // create-raid API, so a truncated ID would create a raid against a nonexistent report.
    expect(extractReportId(`${canonical(ID)}x`)).toBeNull();
  });

  it("returns the first report ID when a string contains several", () => {
    expect(extractReportId(`${canonical(ID)} ${canonical(OTHER_ID)}`)).toBe(ID);
  });
});

describe("buildReportUrl", () => {
  it("builds the canonical URL for a report ID", () => {
    expect(buildReportUrl(ID)).toBe(canonical(ID));
  });

  it("round-trips with extractReportId", () => {
    expect(extractReportId(buildReportUrl(ID))).toBe(ID);
  });
});
