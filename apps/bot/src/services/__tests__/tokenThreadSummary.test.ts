import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "discord.js";
import { postWeeklyTokenEntries } from "../tokenThreadSummary.js";

const { THREAD_ID } = vi.hoisted(() => ({ THREAD_ID: "111111111111111111" }));

vi.mock("../../config/env.js", () => ({
  config: { discordSoftresTokenThreadId: THREAD_ID },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const BOT_USER_ID = "bot-user-id";

interface FakeMessage {
  id: string;
  author: { id: string };
  embeds: Array<{ description?: string; footer?: { text: string } }>;
  edit: ReturnType<typeof vi.fn>;
}

function fakeMessage(
  overrides: Partial<FakeMessage> & { footer?: string; description?: string },
): FakeMessage {
  return {
    id: overrides.id ?? "existing-message",
    author: overrides.author ?? { id: BOT_USER_ID },
    embeds: overrides.embeds ?? [
      {
        description: overrides.description ?? "",
        footer: overrides.footer ? { text: overrides.footer } : undefined,
      },
    ],
    edit: overrides.edit ?? vi.fn().mockResolvedValue(undefined),
  };
}

function fakeClient(overrides: {
  existingMessages?: FakeMessage[];
  send?: ReturnType<typeof vi.fn>;
  isSendable?: boolean;
  isTextBased?: boolean;
}): Client {
  const send = overrides.send ?? vi.fn().mockResolvedValue(undefined);
  const messages = overrides.existingMessages ?? [];
  // Discord.js's real `messages.fetch()` resolves to a Collection (extends Map, but also
  // exposes array-like helpers like `.find()`), which plain Map/array literals don't — this
  // stand-in only needs the one method tokenThreadSummary.ts actually calls.
  const fakeCollection = {
    find: (predicate: (m: FakeMessage) => boolean) => messages.find(predicate),
  };
  return {
    user: { id: BOT_USER_ID },
    channels: {
      fetch: vi.fn().mockResolvedValue({
        isSendable: () => overrides.isSendable ?? true,
        isTextBased: () => overrides.isTextBased ?? true,
        send,
        messages: { fetch: vi.fn().mockResolvedValue(fakeCollection) },
      }),
    },
  } as unknown as Client;
}

describe("postWeeklyTokenEntries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z")); // within the 2026-09-08 lockout week
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing for an empty entry list", async () => {
    const send = vi.fn();
    const client = fakeClient({ send });
    await postWeeklyTokenEntries(client, []);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a new message when no summary exists yet for this week", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [], send });

    await postWeeklyTokenEntries(client, [
      { zone: "Molten Core", url: "https://softres.it/raid/mc?adminToken=abc", timestampSec: 1000 },
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    const embed = send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      "<t:1000:f> Molten Core: https://softres.it/raid/mc?adminToken=abc",
    );
    expect(embed.data.footer.text).toBe("lockout-week:2026-09-08");
  });

  it("edits the existing message for this week instead of sending a new one", async () => {
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-08",
      description: "<t:1000:f> Molten Core: https://softres.it/raid/mc?adminToken=abc",
    });
    const send = vi.fn();
    const client = fakeClient({ existingMessages: [existing], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Blackwing Lair",
        url: "https://softres.it/raid/bwl?adminToken=def",
        timestampSec: 2000,
      },
    ]);

    expect(send).not.toHaveBeenCalled();
    expect(existing.edit).toHaveBeenCalledTimes(1);
    const embed = existing.edit.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      "<t:1000:f> Molten Core: https://softres.it/raid/mc?adminToken=abc\n" +
        "<t:2000:f> Blackwing Lair: https://softres.it/raid/bwl?adminToken=def",
    );
  });

  it("merges out-of-order entries back into chronological order", async () => {
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-08",
      description: "<t:5000:f> Zul'Gurub: https://softres.it/raid/zg?adminToken=zzz",
    });
    const client = fakeClient({ existingMessages: [existing] });

    await postWeeklyTokenEntries(client, [
      { zone: "Molten Core", url: "https://softres.it/raid/mc?adminToken=abc", timestampSec: 1000 },
    ]);

    const embed = existing.edit.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      "<t:1000:f> Molten Core: https://softres.it/raid/mc?adminToken=abc\n" +
        "<t:5000:f> Zul'Gurub: https://softres.it/raid/zg?adminToken=zzz",
    );
  });

  it("starts a new message rather than editing a prior week's summary", async () => {
    const staleWeek = fakeMessage({
      footer: "lockout-week:2026-09-01",
      description: "<t:1000:f> Molten Core: https://softres.it/raid/mc?adminToken=abc",
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [staleWeek], send });

    await postWeeklyTokenEntries(client, [
      { zone: "Onyxia", url: "https://softres.it/raid/ony?adminToken=xyz", timestampSec: 3000 },
    ]);

    expect(staleWeek.edit).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores messages from other authors even if they carry a matching-looking footer", async () => {
    const humanMessage = fakeMessage({
      author: { id: "some-human" },
      footer: "lockout-week:2026-09-08",
      description: "<t:1000:f> should not be reused",
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [humanMessage], send });

    await postWeeklyTokenEntries(client, [
      { zone: "Naxxramas", url: "https://softres.it/raid/naxx?adminToken=n", timestampSec: 4000 },
    ]);

    expect(humanMessage.edit).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("prefixes a bullet with the zone's emoji when one is given", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/mc?adminToken=abc",
        timestampSec: 1000,
        emoji: "<:mc_ragnaros:123>",
      },
    ]);

    const embed = send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      "<t:1000:f> <:mc_ragnaros:123> Molten Core: https://softres.it/raid/mc?adminToken=abc",
    );
  });

  it("logs and does not throw when the thread is not sendable", async () => {
    const send = vi.fn();
    const client = fakeClient({ send, isSendable: false });

    await expect(
      postWeeklyTokenEntries(client, [
        {
          zone: "Molten Core",
          url: "https://softres.it/raid/mc?adminToken=abc",
          timestampSec: 1000,
        },
      ]),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
