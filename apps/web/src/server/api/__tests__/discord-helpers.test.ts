import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env.js", () => ({
  env: {
    DISCORD_RAID_SR_CHANNEL_IDS: ["channel-1"],
    DISCORD_RAID_HELPER_BOT_ID: "raid-helper-bot-id",
    DISCORD_BOT_TOKEN: "test-bot-token",
  },
}));

vi.mock("~/server/db", () => ({ db: {} }));

const CHANNEL_ID = "channel-1";
const GUILD_ID = "guild-1";

function channelInfoResponse() {
  return { id: CHANNEL_ID, name: "sr-signups", guild_id: GUILD_ID };
}

function messagesResponse(messages: unknown[]) {
  return messages;
}

function mockDiscordFetch(messages: unknown[]) {
  global.fetch = vi.fn((url: string) => {
    if (url.includes("/messages")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(messagesResponse(messages)),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(channelInfoResponse()),
    } as Response);
  }) as unknown as typeof fetch;
}

const RECENT_TIMESTAMP = new Date().toISOString();

describe("getDiscordSoftResLinks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("picks up a Raid-Helper signup post with a Bench button", async () => {
    mockDiscordFetch([
      {
        id: "msg-1",
        content: "",
        author: { id: "raid-helper-bot-id", username: "RaidHelper" },
        timestamp: RECENT_TIMESTAMP,
        embeds: [{ title: "Sunday BWL/MC @7PM", description: "https://softres.it/raid/abc123" }],
        components: [{ type: 1, components: [{ type: 2, label: "Bench" }] }],
      },
    ]);

    const { getDiscordSoftResLinks } = await import("~/server/api/discord-helpers");
    const links = await getDiscordSoftResLinks();

    expect(links).toHaveLength(1);
    expect(links[0]?.softResRaidId).toBe("abc123");
    expect(links[0]?.embedTitle).toBe("Sunday BWL/MC @7PM");
  });

  it("excludes a Raid-Helper post with no Bench button (e.g. a roster confirmation)", async () => {
    mockDiscordFetch([
      {
        id: "msg-2",
        content: "",
        author: { id: "raid-helper-bot-id", username: "RaidHelper" },
        timestamp: RECENT_TIMESTAMP,
        embeds: [{ title: "Sunday BWL/MC @7PM", description: "https://softres.it/raid/abc123" }],
        components: [],
      },
    ]);

    const { getDiscordSoftResLinks } = await import("~/server/api/discord-helpers");
    const links = await getDiscordSoftResLinks();

    expect(links).toHaveLength(0);
  });

  it("picks up a SoftRes link a human pastes directly into the channel", async () => {
    mockDiscordFetch([
      {
        id: "msg-3",
        content: "here's the SR link https://softres.it/raid/def456",
        author: { id: "some-human-id", username: "araidleader" },
        timestamp: RECENT_TIMESTAMP,
        embeds: [],
        components: [],
      },
    ]);

    const { getDiscordSoftResLinks } = await import("~/server/api/discord-helpers");
    const links = await getDiscordSoftResLinks();

    expect(links).toHaveLength(1);
    expect(links[0]?.softResRaidId).toBe("def456");
  });

  it("picks up the bot's own 'SRs : ...' embed and strips the prefix from the display title", async () => {
    mockDiscordFetch([
      {
        id: "msg-4",
        content: "",
        author: { id: "temple-bot-id", username: "Temple" },
        timestamp: RECENT_TIMESTAMP,
        embeds: [
          {
            title: "SRs : Sunday BWL/MC @7PM",
            description: "Sun @7PM\n\nBlackwing Lair: https://softres.it/raid/ghi789",
          },
        ],
        components: [],
      },
    ]);

    const { getDiscordSoftResLinks } = await import("~/server/api/discord-helpers");
    const links = await getDiscordSoftResLinks();

    expect(links).toHaveLength(1);
    expect(links[0]?.softResRaidId).toBe("ghi789");
    expect(links[0]?.embedTitle).toBe("Sunday BWL/MC @7PM");
  });

  it("ignores messages older than 7 days", async () => {
    const oldTimestamp = new Date();
    oldTimestamp.setDate(oldTimestamp.getDate() - 10);

    mockDiscordFetch([
      {
        id: "msg-5",
        content: "https://softres.it/raid/old111",
        author: { id: "some-human-id", username: "araidleader" },
        timestamp: oldTimestamp.toISOString(),
        embeds: [],
        components: [],
      },
    ]);

    const { getDiscordSoftResLinks } = await import("~/server/api/discord-helpers");
    const links = await getDiscordSoftResLinks();

    expect(links).toHaveLength(0);
  });
});
