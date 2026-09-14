import { describe, expect, it } from "vitest";
import { buildAdminSoftresEmbed, buildPublicSoftresEmbed } from "../softresEmbeds.js";

describe("softresEmbeds", () => {
  const links = [
    { zone: "Blackwing Lair", url: "https://softres.it/raid/bwl1" },
    { zone: "Molten Core", url: "https://softres.it/raid/mc1" },
  ];

  it("builds a public embed with a title link and per-zone lines", () => {
    const embed = buildPublicSoftresEmbed({
      title: "SRs : Sunday BWL/MC @7PM",
      titleUrl: "https://discord.com/channels/1/2/3",
      dateLabel: "Sun, Sep 13 at 7:00 PM Server Time",
      links,
    });
    const data = embed.toJSON();

    expect(data.title).toBe("SRs : Sunday BWL/MC @7PM");
    expect(data.url).toBe("https://discord.com/channels/1/2/3");
    expect(data.description).toBe(
      "Sun, Sep 13 at 7:00 PM Server Time\n\nBlackwing Lair: https://softres.it/raid/bwl1\nMolten Core: https://softres.it/raid/mc1",
    );
  });

  it("omits the title URL when none is given (e.g. /sr, which has no signup post to link)", () => {
    const embed = buildPublicSoftresEmbed({
      title: "SRs : Molten Core",
      dateLabel: "Sunday 09/13/2026",
      links: [links[1]!],
    });
    const data = embed.toJSON();

    expect(data.url).toBeUndefined();
  });

  it("prefixes a zone line with its emoji when one is given, and leaves it plain otherwise", () => {
    const embed = buildPublicSoftresEmbed({
      title: "SRs : Sunday BWL/MC @7PM",
      dateLabel: "Sun, Sep 13 at 7:00 PM Server Time",
      links: [
        { zone: "Blackwing Lair", url: "https://softres.it/raid/bwl1", emoji: "<:bwl:111>" },
        { zone: "Molten Core", url: "https://softres.it/raid/mc1" },
      ],
    });
    const description = embed.toJSON().description;

    expect(description).toContain("<:bwl:111> Blackwing Lair: https://softres.it/raid/bwl1");
    expect(description).toContain("Molten Core: https://softres.it/raid/mc1");
    expect(description).not.toMatch(/undefined Molten Core/);
  });

  it("builds an admin embed with a distinct color from the public embed", () => {
    const publicEmbed = buildPublicSoftresEmbed({
      title: "SRs : Molten Core",
      dateLabel: "Sunday 09/13/2026",
      links: [links[1]!],
    });
    const adminEmbed = buildAdminSoftresEmbed({
      title: "SRs : Molten Core",
      dateLabel: "Sunday 09/13/2026",
      links: [{ zone: "Molten Core", url: "https://softres.it/raid/mc1?adminToken=tok" }],
    });

    expect(adminEmbed.toJSON().color).not.toBe(publicEmbed.toJSON().color);
    expect(adminEmbed.toJSON().description).toContain("adminToken=tok");
  });
});
