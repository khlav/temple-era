import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeeklyBlockEmbed } from "@temple-era/softres-blocks";

const THREAD = "444444444444444444";

vi.mock("~/env.js", () => ({
  env: {
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_SERVER_ID: "999999999999999999",
    DISCORD_SOFTRES_TOKEN_THREAD_ID: THREAD,
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Tue 9/29 8pm ET; lockout week 2026-09-29.
const TS = Date.parse("2026-09-30T00:00:00Z") / 1000;
const BOT_ID = "bot1";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function stubDiscord(routes: Record<string, unknown>) {
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace("https://discord.com/api/v10", "")}`;
    if (!(key in routes)) throw new Error(`unexpected request: ${key}`);
    return ok(routes[key]);
  });
}

describe("upsertWeeklyTokenBlock", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const entry = {
    zone: "Naxxramas",
    url: "https://softres.it/raid/abc123?adminToken=tok",
    timestampSec: TS,
  };

  it("creates the week's block when none exists", async () => {
    stubDiscord({
      "GET /users/@me": { id: BOT_ID },
      [`GET /channels/${THREAD}/messages?limit=50`]: [],
      [`POST /channels/${THREAD}/messages`]: { id: "new" },
    });
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await upsertWeeklyTokenBlock([entry]);

    const post = mockFetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    const embed = JSON.parse(post[1].body).embeds[0];
    expect(embed.footer.text).toBe("lockout-week:2026-09-29");
    expect(embed.description).toContain("Naxx @ 8pm");
  });

  it("edits the existing block for that week, merging rather than replacing", async () => {
    const existing = buildWeeklyBlockEmbed(undefined, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/zg1?adminToken=z",
        timestampSec: TS + 86400,
      },
    ]);
    stubDiscord({
      "GET /users/@me": { id: BOT_ID },
      [`GET /channels/${THREAD}/messages?limit=50`]: [
        // A human message and another week's block must not be picked.
        { id: "human", author: { id: "someone" }, embeds: [] },
        {
          id: "other-week",
          author: { id: BOT_ID },
          embeds: [{ description: "x", footer: { text: "lockout-week:2026-09-22" } }],
        },
        { id: "this-week", author: { id: BOT_ID }, embeds: [existing] },
      ],
      [`PATCH /channels/${THREAD}/messages/this-week`]: { id: "this-week" },
    });
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await upsertWeeklyTokenBlock([entry]);

    const patch = mockFetch.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    const description = JSON.parse(patch[1].body).embeds[0].description as string;
    expect(description).toContain("ZG @ 8pm");
    expect(description).toContain("Naxx @ 8pm");
  });

  it("throws on a Discord error without echoing the response body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "https://softres.it/raid/abc123?adminToken=tok" }),
    });
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await expect(upsertWeeklyTokenBlock([entry])).rejects.toThrow(/500/);
    await expect(upsertWeeklyTokenBlock([entry])).rejects.not.toThrow(/adminToken/);
  });
});

describe("hasSrPostForEvent", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("matches only the bot's own embed linking to that signup", async () => {
    const url = "https://discord.com/channels/1/2/3";
    stubDiscord({
      "GET /users/@me": { id: BOT_ID },
      "GET /channels/2/messages?limit=100": [
        { id: "a", author: { id: "someone" }, embeds: [{ url }] },
        {
          id: "b",
          author: { id: BOT_ID },
          embeds: [{ url: "https://discord.com/channels/1/2/9" }],
        },
      ],
    });
    const { hasSrPostForEvent } = await import("../softres-discord-service");
    expect(await hasSrPostForEvent("2", url)).toBe(false);

    stubDiscord({
      "GET /users/@me": { id: BOT_ID },
      "GET /channels/2/messages?limit=100": [
        { id: "c", author: { id: BOT_ID }, embeds: [{ url }] },
      ],
    });
    expect(await hasSrPostForEvent("2", url)).toBe(true);
  });

  it("is false, not an error, when the channel can't be read", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const { hasSrPostForEvent } = await import("../softres-discord-service");
    expect(await hasSrPostForEvent("2", "https://discord.com/channels/1/2/3")).toBe(false);
  });
});

describe("getZoneEmojiMap", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it("maps zones to <:name:id> by the shared emoji names, skipping any that are missing", async () => {
    stubDiscord({
      "GET /guilds/999999999999999999/emojis": [
        { id: "5", name: "naxx_kelthuzad" },
        { id: "6", name: "unrelated" },
      ],
    });
    const { getZoneEmojiMap } = await import("../softres-discord-service");
    const map = await getZoneEmojiMap();

    expect(map.get("Naxxramas")).toBe("<:naxx_kelthuzad:5>");
    expect(map.has("Molten Core")).toBe(false);
  });

  it("returns an empty map on failure rather than throwing", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const { getZoneEmojiMap } = await import("../softres-discord-service");
    expect((await getZoneEmojiMap()).size).toBe(0);
  });
});
