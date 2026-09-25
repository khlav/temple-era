import { describe, expect, it } from "vitest";
import {
  blockHasRaid,
  buildWeeklyBlockEmbed,
  formatRaidWhen,
  weeklyBlockFooter,
} from "../weekly-token-block.js";
import { ADMIN_EMBED_COLOR } from "../embeds.js";

// Tuesday 9/15/2026 7:00pm ET, 7:30pm ET; Wednesday 9/16 6:30pm ET — all in lockout week
// "2026-09-15".
const TUE_7PM = 1789513200;
const TUE_730PM = 1789515000;
const WED_630PM = 1789597800;

describe("buildWeeklyBlockEmbed", () => {
  it("groups by day, chronologically, with short flat/half-hour times", () => {
    const embed = buildWeeklyBlockEmbed(undefined, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/wed1?adminToken=tokW",
        timestampSec: WED_630PM,
      },
      {
        zone: "Blackwing Lair",
        url: "https://softres.it/raid/tue1?adminToken=tokA",
        emoji: "<:bwl_nefarian:1>",
        timestampSec: TUE_730PM,
      },
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/tue2?adminToken=tokB",
        emoji: "<:mc_ragnaros:2>",
        timestampSec: TUE_7PM,
      },
    ]);

    expect(embed.description).toBe(
      [
        "- **Tuesday 9/15**",
        `  - <:mc_ragnaros:2> MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
        `  - <:bwl_nefarian:1> BWL @ 7:30pm — [tue1 | admintoken: tokA](https://softres.it/raid/tue1?adminToken=tokA#ts=${TUE_730PM})`,
        "- **Wednesday 9/16**",
        `  - ZG @ 6:30pm — [wed1 | admintoken: tokW](https://softres.it/raid/wed1?adminToken=tokW#ts=${WED_630PM})`,
      ].join("\n"),
    );
    expect(embed.title).toBe("SR Admin Tokens — Week of Sep 15");
    expect(embed.color).toBe(ADMIN_EMBED_COLOR);
    expect(embed.footer).toEqual({ text: "lockout-week:2026-09-15" });
  });

  it("merges into an existing block, keeping its entries", () => {
    const first = buildWeeklyBlockEmbed(undefined, [
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/tue2?adminToken=tokB",
        timestampSec: TUE_7PM,
      },
    ]);
    const merged = buildWeeklyBlockEmbed(first.description, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/wed1?adminToken=tokW",
        timestampSec: WED_630PM,
      },
    ]);

    expect(merged.description).toContain("MC @ 7pm");
    expect(merged.description).toContain("ZG @ 6:30pm");
  });

  it("replaces an existing line for the same raid id instead of duplicating it", () => {
    const first = buildWeeklyBlockEmbed(undefined, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/same1?adminToken=old",
        timestampSec: TUE_7PM,
      },
    ]);
    const again = buildWeeklyBlockEmbed(first.description, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/same1?adminToken=new",
        timestampSec: TUE_730PM,
      },
    ]);

    expect(again.description.match(/same1 \|/g)).toHaveLength(1);
    expect(again.description).toContain("Naxx @ 7:30pm");
    expect(again.description).toContain("admintoken: new");
  });

  it("recovers entries from the legacy flat format", () => {
    const legacy = `<t:${TUE_7PM}:f> <:mc:1> Molten Core: https://softres.it/raid/old1?adminToken=tok`;
    const embed = buildWeeklyBlockEmbed(legacy, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/wed1?adminToken=tokW",
        timestampSec: WED_630PM,
      },
    ]);

    expect(embed.description).toContain("<:mc:1> MC @ 7pm");
  });

  it("falls back to a plain link label when the admin URL has an unexpected shape", () => {
    const embed = buildWeeklyBlockEmbed(undefined, [
      { zone: "Onyxia", url: "https://softres.it/weird-shape", timestampSec: TUE_7PM },
    ]);

    expect(embed.description).toBe(
      `- **Tuesday 9/15**\n  - Ony @ 7pm — [link](https://softres.it/weird-shape#ts=${TUE_7PM})`,
    );
  });

  it("refuses an empty entry list", () => {
    expect(() => buildWeeklyBlockEmbed(undefined, [])).toThrow();
  });
});

describe("weeklyBlockFooter / blockHasRaid / formatRaidWhen", () => {
  it("keys the footer to the raid's own lockout week, not the current one", () => {
    expect(weeklyBlockFooter(TUE_7PM)).toBe("lockout-week:2026-09-15");
    expect(weeklyBlockFooter(TUE_7PM + 7 * 86400)).toBe("lockout-week:2026-09-22");
  });

  it("finds a raid id in a rendered block", () => {
    const embed = buildWeeklyBlockEmbed(undefined, [
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/abc123?adminToken=tok",
        timestampSec: TUE_7PM,
      },
    ]);

    expect(blockHasRaid(embed.description, "abc123")).toBe(true);
    expect(blockHasRaid(embed.description, "other")).toBe(false);
  });

  it("describes a raid night the way the block words it", () => {
    expect(formatRaidWhen(TUE_730PM)).toBe("Tuesday 9/15 @ 7:30pm");
  });
});
