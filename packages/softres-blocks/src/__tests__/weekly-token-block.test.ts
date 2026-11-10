import { describe, expect, it } from "vitest";
import {
  adminUrlRaidId,
  blockHasRaid,
  buildWeeklyBlockEmbed,
  formatRaidWhen,
  weeklyBlockFooter,
  weeklyBlockRaidsForZone,
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
        "- **Tue 9/15**",
        `  - <:mc_ragnaros:2> MC @ 7pm — [tue2 | token: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
        `  - <:bwl_nefarian:1> BWL @ 7:30pm — [tue1 | token: tokA](https://softres.it/raid/tue1?adminToken=tokA#ts=${TUE_730PM})`,
        `- **Wed 9/16** ZG @ 6:30pm — [wed1 | token: tokW](https://softres.it/raid/wed1?adminToken=tokW#ts=${WED_630PM})`,
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
    expect(again.description).toContain("token: new");
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
      `- **Tue 9/15** Ony @ 7pm — [link](https://softres.it/weird-shape#ts=${TUE_7PM})`,
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

  it("reads the raid id out of an admin link, or null for an odd shape", () => {
    expect(adminUrlRaidId("https://softres.it/raid/abc123?adminToken=tok")).toBe("abc123");
    expect(adminUrlRaidId("https://softres.it/weird-shape")).toBeNull();
  });

  it("describes a raid night the way the block words it", () => {
    expect(formatRaidWhen(TUE_730PM)).toBe("Tuesday 9/15 @ 7:30pm");
  });
});

describe("weeklyBlockRaidsForZone", () => {
  const embed = buildWeeklyBlockEmbed(undefined, [
    {
      zone: "Naxxramas",
      url: "https://softres.it/raid/naxxB?adminToken=t2",
      emoji: "<:naxx_kelthuzad:3>",
      timestampSec: WED_630PM,
    },
    {
      zone: "Molten Core",
      url: "https://softres.it/raid/mc1?adminToken=t3",
      timestampSec: TUE_730PM,
    },
    {
      zone: "Naxxramas",
      url: "https://softres.it/raid/naxxA?adminToken=t1",
      timestampSec: TUE_7PM,
    },
  ]);

  it("lists only that zone's raids, oldest first, with or without an emoji", () => {
    expect(weeklyBlockRaidsForZone(embed.description, "Naxxramas")).toEqual([
      { raidId: "naxxA", timestampSec: TUE_7PM },
      { raidId: "naxxB", timestampSec: WED_630PM },
    ]);
    expect(weeklyBlockRaidsForZone(embed.description, "Molten Core")).toEqual([
      { raidId: "mc1", timestampSec: TUE_730PM },
    ]);
  });

  it("is empty for a zone the block doesn't list", () => {
    expect(weeklyBlockRaidsForZone(embed.description, "Blackwing Lair")).toEqual([]);
  });
});

describe("unlinked entries (an SR attached in Raid Helper's own setup)", () => {
  const unlinked = {
    zone: "Molten Core",
    url: "https://softres.it/raid/rh1",
    emoji: "<:mc_ragnaros:2>",
    timestampSec: TUE_7PM,
  };
  const admin = {
    zone: "Molten Core",
    url: "https://softres.it/raid/rh1?adminToken=tok",
    emoji: "<:mc_ragnaros:2>",
    timestampSec: TUE_7PM,
  };

  it("renders the public link, with a plain-text note in place of the admin token", () => {
    const embed = buildWeeklyBlockEmbed(undefined, [unlinked]);
    expect(embed.description).toBe(
      "- **Tue 9/15** <:mc_ragnaros:2> MC @ 7pm — [rh1](https://softres.it/raid/rh1#ts=1789513200) no token, Raidhelper SR",
    );
  });

  it("survives a round trip through the rendered message", () => {
    const first = buildWeeklyBlockEmbed(undefined, [unlinked]);
    const next = buildWeeklyBlockEmbed(first.description, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/zg1?adminToken=t",
        timestampSec: WED_630PM,
      },
    ]);
    expect(next.description).toContain(
      "[rh1](https://softres.it/raid/rh1#ts=1789513200) no token, Raidhelper SR",
    );
    expect(next.description).toContain("[zg1 | token: t]");
  });

  it("is replaced by the admin link once the raid lead posts it", () => {
    const first = buildWeeklyBlockEmbed(undefined, [unlinked]);
    const next = buildWeeklyBlockEmbed(first.description, [admin]);
    expect(next.description).not.toContain("no token, Raidhelper SR");
    expect(next.description).toContain("[rh1 | token: tok]");
  });

  it("never replaces a line that already has the admin token", () => {
    const first = buildWeeklyBlockEmbed(undefined, [admin]);
    const next = buildWeeklyBlockEmbed(first.description, [unlinked]);
    expect(next.description).toBe(first.description);
  });

  it("doesn't count as listed for blockHasRaid, so the add-token prompt still fires", () => {
    const embed = buildWeeklyBlockEmbed(undefined, [unlinked]);
    expect(blockHasRaid(embed.description, "rh1")).toBe(false);
  });

  it("reads back an entry in the earlier in-link label format", () => {
    const old =
      "- **Tuesday 9/15**\n  - MC @ 7pm — [rh1 | unlinked (RaidHelper, RL has code)](https://softres.it/raid/rh1#ts=1789513200)";
    const next = buildWeeklyBlockEmbed(old, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/zg1?adminToken=t",
        timestampSec: WED_630PM,
      },
    ]);
    expect(next.description).toContain(
      "MC @ 7pm — [rh1](https://softres.it/raid/rh1#ts=1789513200) no token, Raidhelper SR",
    );
  });

  it("is found by weeklyBlockRaidsForZone, so a clean-up night can reuse it", () => {
    const embed = buildWeeklyBlockEmbed(undefined, [{ ...unlinked, zone: "Naxxramas" }]);
    expect(weeklyBlockRaidsForZone(embed.description, "Naxxramas")).toEqual([
      { raidId: "rh1", timestampSec: TUE_7PM },
    ]);
  });
});

describe("earlier label formats", () => {
  it("re-renders an 'admintoken:' label and a piped note in the current format", () => {
    const old = [
      "- **Tuesday 9/15**",
      "  - MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=1789513200)",
      "  - Ony @ 7:30pm — [rh1](https://softres.it/raid/rh1#ts=1789515000) | Cannot get admin code from RaidHelper-generated SRs",
    ].join("\n");
    const next = buildWeeklyBlockEmbed(old, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/zg1?adminToken=t",
        timestampSec: WED_630PM,
      },
    ]);
    expect(next.description).toContain(
      "MC @ 7pm — [tue2 | token: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=1789513200)",
    );
    expect(next.description).toContain(
      "Ony @ 7:30pm — [rh1](https://softres.it/raid/rh1#ts=1789515000) no token, Raidhelper SR",
    );
  });
});

describe("unbulleted short-day layout", () => {
  it("reads back '**Tue**' single-raid lines and '\\- ' nested lines", () => {
    const old = [
      "**Tue 9/15**",
      "\\- MC @ 7pm — [tue2 | token: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=1789513200)",
      "\\- BWL @ 7:30pm — [tue1 | token: tokA](https://softres.it/raid/tue1?adminToken=tokA#ts=1789515000)",
      "**Wed 9/16** ZG @ 6:30pm — [wed1 | token: tokW](https://softres.it/raid/wed1?adminToken=tokW#ts=1789597800)",
    ].join("\n");
    const next = buildWeeklyBlockEmbed(old, [
      {
        zone: "Onyxia",
        url: "https://softres.it/raid/thu1?adminToken=t",
        timestampSec: 1789686000,
      },
    ]);
    expect(next.description.split("\n")).toEqual([
      "- **Tue 9/15**",
      "  - MC @ 7pm — [tue2 | token: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=1789513200)",
      "  - BWL @ 7:30pm — [tue1 | token: tokA](https://softres.it/raid/tue1?adminToken=tokA#ts=1789515000)",
      "- **Wed 9/16** ZG @ 6:30pm — [wed1 | token: tokW](https://softres.it/raid/wed1?adminToken=tokW#ts=1789597800)",
      "- **Thu 9/17** Ony @ 7pm — [thu1 | token: t](https://softres.it/raid/thu1?adminToken=t#ts=1789686000)",
    ]);
  });
});
