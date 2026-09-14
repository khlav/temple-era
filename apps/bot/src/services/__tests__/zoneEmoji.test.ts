import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "discord.js";
import { ensureZoneEmoji, getZoneEmoji } from "../zoneEmoji.js";

const { SERVER_ID } = vi.hoisted(() => ({ SERVER_ID: "555555555555555555" }));

vi.mock("../../config/env.js", () => ({
  config: { discordServerId: SERVER_ID },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function fakeExistingEmoji(names: string[]) {
  return {
    find: (predicate: (e: { name: string }) => boolean) =>
      names.map((name) => ({ id: `existing-${name}`, name })).find(predicate),
  };
}

function fakeClient(overrides: {
  existingEmojiNames?: string[];
  create?: ReturnType<typeof vi.fn>;
}): Client {
  const create = overrides.create ?? vi.fn();
  return {
    guilds: {
      fetch: vi.fn().mockResolvedValue({
        emojis: {
          fetch: vi.fn().mockResolvedValue(fakeExistingEmoji(overrides.existingEmojiNames ?? [])),
          create,
        },
      }),
    },
  } as unknown as Client;
}

describe("zoneEmoji", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Reset the module-level cache between tests — there's no exported reset, so forcing the
    // guild fetch to fail is the cleanest way to leave it in a known-empty state.
    const failingClient = {
      guilds: { fetch: vi.fn().mockRejectedValue(new Error("reset")) },
    } as unknown as Client;
    await ensureZoneEmoji(failingClient);
  });

  it("returns undefined for every zone before ensureZoneEmoji has run successfully", async () => {
    // Force a guild fetch failure so the cache is set but empty.
    const client = {
      guilds: { fetch: vi.fn().mockRejectedValue(new Error("no guild")) },
    } as unknown as Client;
    await ensureZoneEmoji(client);

    expect(getZoneEmoji("Molten Core")).toBeUndefined();
  });

  it("uploads emoji for zones with none yet, and caches `<:name:id>` per zone", async () => {
    const create = vi
      .fn()
      .mockImplementation(({ name }: { name: string }) =>
        Promise.resolve({ id: `new-${name}`, name }),
      );
    const client = fakeClient({ existingEmojiNames: [], create });

    await ensureZoneEmoji(client);

    // 7 configured zones, all newly created.
    expect(create).toHaveBeenCalledTimes(7);
    expect(getZoneEmoji("Molten Core")).toBe("<:mc_ragnaros:new-mc_ragnaros>");
    expect(getZoneEmoji("Blackwing Lair")).toBe("<:bwl_nefarian:new-bwl_nefarian>");
  });

  it("reuses an existing emoji by name instead of re-uploading it", async () => {
    const create = vi
      .fn()
      .mockImplementation(({ name }: { name: string }) =>
        Promise.resolve({ id: `new-${name}`, name }),
      );
    const client = fakeClient({ existingEmojiNames: ["mc_ragnaros"], create });

    await ensureZoneEmoji(client);

    expect(create).toHaveBeenCalledTimes(6); // every zone except Molten Core
    expect(getZoneEmoji("Molten Core")).toBe("<:mc_ragnaros:existing-mc_ragnaros>");
  });

  it("logs and skips a zone whose upload fails, without blocking the others", async () => {
    const create = vi.fn().mockImplementation(({ name }: { name: string }) => {
      if (name === "mc_ragnaros") return Promise.reject(new Error("upload failed"));
      return Promise.resolve({ id: `new-${name}`, name });
    });
    const client = fakeClient({ existingEmojiNames: [], create });

    await ensureZoneEmoji(client);

    expect(getZoneEmoji("Molten Core")).toBeUndefined();
    expect(getZoneEmoji("Blackwing Lair")).toBe("<:bwl_nefarian:new-bwl_nefarian>");
  });

  it("returns undefined for a zone name with no configured icon", async () => {
    await ensureZoneEmoji(fakeClient({ existingEmojiNames: [] }));
    expect(getZoneEmoji("Not A Real Zone")).toBeUndefined();
  });
});
