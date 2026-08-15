import { describe, expect, it } from "vitest";
import { summarizeSignupCounts } from "~/lib/raid-signup-status";

function signup(className: string) {
  return { className };
}

describe("summarizeSignupCounts", () => {
  it("matches the TEMPLE-95 example: 52 confirmed + 5 bench + 4 absent", () => {
    const signups = [
      ...Array.from({ length: 52 }, () => signup("Warrior")),
      ...Array.from({ length: 5 }, () => signup("Bench")),
      ...Array.from({ length: 4 }, () => signup("Absence")),
    ];

    expect(summarizeSignupCounts(signups)).toEqual({ confirmed: 52, bench: 5 });
  });

  it("excludes both 'Absence' and 'Absent' spellings entirely", () => {
    const signups = [signup("Mage"), signup("Absence"), signup("Absent")];

    expect(summarizeSignupCounts(signups)).toEqual({ confirmed: 1, bench: 0 });
  });

  it("treats Tentative and Late as confirmed", () => {
    const signups = [signup("Tentative"), signup("Late"), signup("Priest")];

    expect(summarizeSignupCounts(signups)).toEqual({ confirmed: 3, bench: 0 });
  });

  it("returns zeros for an empty signup list", () => {
    expect(summarizeSignupCounts([])).toEqual({ confirmed: 0, bench: 0 });
  });
});
