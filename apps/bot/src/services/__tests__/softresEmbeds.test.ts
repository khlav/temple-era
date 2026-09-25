import { describe, expect, it } from "vitest";
import { EmbedBuilder } from "discord.js";
import { buildPublicSoftresEmbed } from "../softresEmbeds.js";

// What the embed says is tested in packages/softres-blocks; this only covers the discord.js wrap.
describe("buildPublicSoftresEmbed", () => {
  it("wraps the shared embed data in a discord.js EmbedBuilder", () => {
    const embed = buildPublicSoftresEmbed({
      title: "SRs : Sunday BWL/MC @7PM",
      titleUrl: "https://discord.com/channels/1/2/3",
      dateLabel: "Sun, Sep 13 at 7:00 PM Server Time",
      links: [{ zone: "Molten Core", url: "https://softres.it/raid/mc1" }],
    });

    expect(embed).toBeInstanceOf(EmbedBuilder);
    const data = embed.toJSON();
    expect(data.title).toBe("SRs : Sunday BWL/MC @7PM");
    expect(data.url).toBe("https://discord.com/channels/1/2/3");
    expect(data.description).toContain("Molten Core: https://softres.it/raid/mc1");
  });
});
