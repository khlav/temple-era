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

interface FakeMessage {
  id: string;
  author: { id: string };
  embeds: Array<{ description?: string; footer?: { text: string } }>;
}

/**
 * A stateful stand-in for the Token thread. `interfere` runs right after each write and may
 * overwrite a message, the way a second writer's PATCH would.
 */
function fakeThread(
  initial: FakeMessage[],
  interfere?: (messages: FakeMessage[], writeCount: number) => void,
) {
  const messages = [...initial];
  let writes = 0;
  let nextId = 1;
  const base = `https://discord.com/api/v10/channels/${THREAD}/messages`;
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "https://discord.com/api/v10/users/@me") return ok({ id: BOT_ID });
    if (method === "GET" && url === `${base}?limit=50`) return ok(messages);
    if (method === "GET" && url.startsWith(`${base}/`)) {
      const found = messages.find((m) => m.id === url.slice(base.length + 1));
      return found ? ok(found) : { ok: false, status: 404, json: async () => ({}) };
    }
    if (method === "POST" && url === base) {
      const msg = {
        id: `new${nextId++}`,
        author: { id: BOT_ID },
        embeds: JSON.parse(init!.body as string).embeds,
      };
      messages.push(msg);
      interfere?.(messages, ++writes);
      return ok({ id: msg.id });
    }
    if (method === "PATCH" && url.startsWith(`${base}/`)) {
      const msg = messages.find((m) => m.id === url.slice(base.length + 1))!;
      msg.embeds = JSON.parse(init!.body as string).embeds;
      interfere?.(messages, ++writes);
      return ok({ id: msg.id });
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  });
  return messages;
}

const entry = {
  zone: "Naxxramas",
  url: "https://softres.it/raid/abc123?adminToken=tok",
  timestampSec: TS,
};

describe("upsertWeeklyTokenBlock", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the week's block when none exists", async () => {
    const messages = fakeThread([]);
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await upsertWeeklyTokenBlock([entry]);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.embeds[0]!.footer!.text).toBe("lockout-week:2026-09-29");
    expect(messages[0]!.embeds[0]!.description).toContain("Naxx @ 8pm");
  });

  it("edits the existing block for that week, merging rather than replacing", async () => {
    const existing = buildWeeklyBlockEmbed(undefined, [
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/zg1?adminToken=z",
        timestampSec: TS + 86400,
      },
    ]);
    const messages = fakeThread([
      // A human message and another week's block must not be picked.
      { id: "human", author: { id: "someone" }, embeds: [] },
      {
        id: "other-week",
        author: { id: BOT_ID },
        embeds: [{ description: "x", footer: { text: "lockout-week:2026-09-22" } }],
      },
      { id: "this-week", author: { id: BOT_ID }, embeds: [existing] },
    ]);
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await upsertWeeklyTokenBlock([entry]);

    expect(messages).toHaveLength(3);
    const description = messages.find((m) => m.id === "this-week")!.embeds[0]!.description!;
    expect(description).toContain("ZG @ 8pm");
    expect(description).toContain("Naxx @ 8pm");
  });

  it("notices when another writer overwrote its entry, and writes it again", async () => {
    const original = buildWeeklyBlockEmbed(undefined, [
      { zone: "Molten Core", url: "https://softres.it/raid/mc1?adminToken=m", timestampSec: TS },
    ]);
    let interfered = false;
    const messages = fakeThread(
      [{ id: "this-week", author: { id: BOT_ID }, embeds: [original] }],
      (all, writeCount) => {
        // The first write is clobbered by a competing writer who never saw this entry.
        if (writeCount === 1 && !interfered) {
          interfered = true;
          all.find((m) => m.id === "this-week")!.embeds = [original];
        }
      },
    );
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await upsertWeeklyTokenBlock([entry]);

    const description = messages.find((m) => m.id === "this-week")!.embeds[0]!.description!;
    expect(description).toContain("abc123");
    expect(description).toContain("mc1");
    const patches = mockFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(2);
  });

  it("gives up with an error if the write keeps getting overwritten", async () => {
    const original = buildWeeklyBlockEmbed(undefined, [
      { zone: "Molten Core", url: "https://softres.it/raid/mc1?adminToken=m", timestampSec: TS },
    ]);
    fakeThread([{ id: "this-week", author: { id: BOT_ID }, embeds: [original] }], (all) => {
      all.find((m) => m.id === "this-week")!.embeds = [original];
    });
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    await expect(upsertWeeklyTokenBlock([entry])).rejects.toThrow(/did not persist/);
    expect(mockFetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(3);
  });

  it("runs concurrent calls one at a time, so neither loses its entry", async () => {
    const messages = fakeThread([]);
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");
    const second = {
      zone: "Zul'Gurub",
      url: "https://softres.it/raid/zg1?adminToken=z",
      timestampSec: TS,
    };

    await Promise.all([upsertWeeklyTokenBlock([entry]), upsertWeeklyTokenBlock([second])]);

    expect(messages).toHaveLength(1);
    const description = messages[0]!.embeds[0]!.description!;
    expect(description).toContain("abc123");
    expect(description).toContain("zg1");
  });

  it("keeps working for later calls after one fails", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"));
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");
    await expect(upsertWeeklyTokenBlock([entry])).rejects.toThrow();

    const messages = fakeThread([]);
    await upsertWeeklyTokenBlock([entry]);
    expect(messages).toHaveLength(1);
  });

  it("throws on a Discord error without echoing the response body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "https://softres.it/raid/abc123?adminToken=tok" }),
    });
    const { upsertWeeklyTokenBlock } = await import("../softres-discord-service");

    const error = await upsertWeeklyTokenBlock([entry]).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/500/);
    expect((error as Error).message).not.toMatch(/adminToken/);
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
