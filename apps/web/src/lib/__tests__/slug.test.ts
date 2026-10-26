import { describe, expect, it } from "vitest";
import { kebabCaseSlug, raidPath } from "~/lib/slug";

describe("raidPath", () => {
  it("builds the canonical slug path the raid page redirects to", () => {
    expect(raidPath(931, "Naxx Tue 10/20")).toBe(`/raids/931/${kebabCaseSlug("Naxx Tue 10/20")}`);
    expect(raidPath(931, "Naxx Tue 10/20")).toBe("/raids/931/naxx-tue-10-20");
  });

  it("falls back to the bare id when there is no usable name", () => {
    expect(raidPath(931, null)).toBe("/raids/931");
    expect(raidPath(931, undefined)).toBe("/raids/931");
    expect(raidPath(931, "!!!")).toBe("/raids/931");
  });
});
