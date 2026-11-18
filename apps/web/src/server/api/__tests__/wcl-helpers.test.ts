import { describe, expect, it, vi } from "vitest";

// `wcl-helpers` pulls in `~/env` for the Warcraft Logs credentials that `GetWCLGraphQLQuery` uses.
// The shaper itself needs none of them.
vi.mock("~/env", () => ({
  env: {
    WCL_OAUTH_URL: "https://example.test/oauth",
    WCL_API_URL: "https://example.test/api",
    WCL_CLIENT_ID: "id",
    WCL_CLIENT_SECRET: "secret",
  },
}));

import { RaidReportDataShaper, WclReportIncompleteError } from "~/server/api/wcl-helpers";
import type { RawRaidReportRequestResult } from "~/server/api/interfaces/wcl";

/**
 * The shapes here are real Warcraft Logs responses, not invented ones: a log posted at the pull
 * comes back with a zone, fights and masterData that are all null, and every one of those used to
 * be an unguarded dereference. See the 2026-11-18 Naxx log, posted 6 minutes after the raid
 * started, which 500'd `POST /api/discord/create-raid` and produced no raid at all.
 */
const report = (overrides: Record<string, unknown> = {}) =>
  ({
    data: {
      reportData: {
        report: {
          code: "Zv2tDV94PJ16gayB",
          title: "Naxx 11/17",
          startTime: 1794964044799,
          endTime: 1794974287662,
          guild: { id: 1, name: "Tenple" },
          zone: { id: 2006, name: "Naxxramas" },
          fights: [],
          masterData: { actors: [] },
          ...overrides,
        },
      },
    },
  }) as unknown as RawRaidReportRequestResult;

describe("RaidReportDataShaper", () => {
  it("shapes a complete report", () => {
    const shaped = RaidReportDataShaper(
      report({
        fights: [
          { id: 1, name: "Patchwerk", kill: true, friendlyPlayers: [1] },
          { id: 2, name: "Thaddius", kill: false, friendlyPlayers: [1, 2] },
        ],
        masterData: {
          actors: [
            { id: 1, gameID: 100, name: "Wawful", server: "Ashkandi", subType: "Shaman", icon: "" },
            { id: 2, gameID: 200, name: "Nala", server: "Mankrik", subType: "Priest", icon: "" },
          ],
        },
      }),
    );

    expect(shaped.zone).toBe("Naxxramas");
    expect(shaped.kills).toEqual(["Patchwerk"]);
    expect(Object.keys(shaped.participants)).toHaveLength(2);
  });

  it("refuses a report with no zone rather than importing a zoneless log", () => {
    // A zoneless raid would take attendance weight 0 and silently credit nobody, which is worse
    // than not existing yet.
    expect(() => RaidReportDataShaper(report({ zone: null }))).toThrow(WclReportIncompleteError);
  });

  it("carries the report title on the incomplete error, for naming the thread", () => {
    try {
      RaidReportDataShaper(report({ zone: null }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WclReportIncompleteError);
      expect((error as WclReportIncompleteError).title).toBe("Naxx 11/17");
      expect((error as WclReportIncompleteError).reportId).toBe("Zv2tDV94PJ16gayB");
    }
  });

  it.each([
    ["fights", { fights: null }],
    ["masterData", { masterData: null }],
  ])("refuses a report whose %s has not arrived", (_field, overrides) => {
    // Null is "Warcraft Logs did not report this", not "there was nothing". Shaping it to an empty
    // array would make a refresh rewrite kills to none and delete every attendee of an already
    // imported raid.
    expect(() => RaidReportDataShaper(report(overrides))).toThrow(WclReportIncompleteError);
  });

  it("accepts a zoned report that genuinely reports no fights", () => {
    // An empty array is an answer; only null is a gap.
    const shaped = RaidReportDataShaper(report({ fights: [], masterData: { actors: [] } }));

    expect(shaped.zone).toBe("Naxxramas");
    expect(shaped.kills).toEqual([]);
    expect(shaped.participants).toEqual({});
  });

  it("reports a missing report as itself, not as a null dereference", () => {
    const empty = { data: { reportData: { report: null } } } as RawRaidReportRequestResult;

    expect(() => RaidReportDataShaper(empty)).toThrow(/no report/i);
    expect(() => RaidReportDataShaper(empty)).not.toThrow(WclReportIncompleteError);
  });

  it("reports an error body from a failed Warcraft Logs call as itself", () => {
    // `GetWCLGraphQLQuery` used to answer with `{ error }` and no `data` on a WCL outage, and this
    // function then died on `apiData.data.reportData` with an unreadable TypeError.
    const errorBody = {
      error: "Failed to fetch data from API",
    } as unknown as RawRaidReportRequestResult;

    expect(() => RaidReportDataShaper(errorBody)).toThrow(/no report/i);
  });
});
