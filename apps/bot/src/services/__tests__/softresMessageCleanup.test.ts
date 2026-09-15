import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "discord.js";
import { cleanupOldSoftresMessages } from "../softresMessageCleanup.js";

const { CHANNEL_A, CHANNEL_B } = vi.hoisted(() => ({
  CHANNEL_A: "channel-a",
  CHANNEL_B: "channel-b",
}));

vi.mock("../../config/env.js", () => ({
  config: {
    discordRaidSrChannelIds: [CHANNEL_A],
    threadCleanupEnabled: true,
    threadCleanupDays: 3,
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const BOT_USER_ID = "bot-user-id";
const NOW = new Date("2026-09-22T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

interface FakeMessage {
  id: string;
  author: { id: string };
  embeds: Array<{ title?: string }>;
  createdTimestamp: number;
  delete: ReturnType<typeof vi.fn>;
}

function fakeMessage(overrides: Partial<FakeMessage> & { title?: string }): FakeMessage {
  return {
    id: overrides.id ?? "msg",
    author: overrides.author ?? { id: BOT_USER_ID },
    embeds: overrides.embeds ?? (overrides.title ? [{ title: overrides.title }] : []),
    createdTimestamp: overrides.createdTimestamp ?? NOW.getTime(),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  };
}

function fakeClient(channelMessages: Record<string, FakeMessage[] | null>): Client {
  return {
    user: { id: BOT_USER_ID },
    channels: {
      fetch: vi.fn().mockImplementation((channelId: string) => {
        const messages = channelMessages[channelId];
        if (messages === undefined) return Promise.resolve(undefined);
        if (messages === null) {
          // Simulates a non-text-based channel.
          return Promise.resolve({ isTextBased: () => false });
        }
        return Promise.resolve({
          isTextBased: () => true,
          messages: { fetch: vi.fn().mockResolvedValue(new Map(messages.map((m) => [m.id, m]))) },
        });
      }),
    },
  } as unknown as Client;
}

describe("cleanupOldSoftresMessages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the newest SR message even when it's older than the cutoff", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const onlyMessage = fakeMessage({
      id: "only",
      title: "SRs : AQ40",
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
      delete: del,
    });
    const client = fakeClient({ [CHANNEL_A]: [onlyMessage] });

    await cleanupOldSoftresMessages(client);

    expect(del).not.toHaveBeenCalled();
  });

  it("deletes SR messages older than the cutoff that are behind the newest one", async () => {
    const oldDel = vi.fn().mockResolvedValue(undefined);
    const newest = fakeMessage({
      id: "newest",
      title: "SRs : AQ40",
      createdTimestamp: NOW.getTime() - 1 * DAY_MS,
    });
    const old = fakeMessage({
      id: "old",
      title: "SRs : BWL/MC",
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
      delete: oldDel,
    });
    const client = fakeClient({ [CHANNEL_A]: [old, newest] });

    await cleanupOldSoftresMessages(client);

    expect(oldDel).toHaveBeenCalledTimes(1);
    expect(newest.delete).not.toHaveBeenCalled();
  });

  it("leaves a second-newest message alone if it's still within the cutoff window", async () => {
    const newest = fakeMessage({
      id: "newest",
      title: "SRs : AQ40",
      createdTimestamp: NOW.getTime() - 1 * DAY_MS,
    });
    const recentSecond = fakeMessage({
      id: "recent-second",
      title: "SRs : BWL/MC",
      createdTimestamp: NOW.getTime() - 2 * DAY_MS,
    });
    const client = fakeClient({ [CHANNEL_A]: [recentSecond, newest] });

    await cleanupOldSoftresMessages(client);

    expect(recentSecond.delete).not.toHaveBeenCalled();
    expect(newest.delete).not.toHaveBeenCalled();
  });

  it("ignores non-SR bot messages and other users' messages regardless of age", async () => {
    const otherBotMessage = fakeMessage({
      id: "other-bot-msg",
      title: undefined,
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
    });
    const humanMessage = fakeMessage({
      id: "human-msg",
      author: { id: "some-human" },
      title: "SRs : AQ40",
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
    });
    const srMessage = fakeMessage({
      id: "sr-msg",
      title: "SRs : AQ40",
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
    });
    const client = fakeClient({ [CHANNEL_A]: [otherBotMessage, humanMessage, srMessage] });

    await cleanupOldSoftresMessages(client);

    expect(otherBotMessage.delete).not.toHaveBeenCalled();
    expect(humanMessage.delete).not.toHaveBeenCalled();
    // srMessage is the only real SR message found, so it's "the newest" and kept.
    expect(srMessage.delete).not.toHaveBeenCalled();
  });

  it("does nothing when cleanup is disabled", async () => {
    const envModule = await import("../../config/env.js");
    (envModule.config as { threadCleanupEnabled: boolean }).threadCleanupEnabled = false;

    const client = fakeClient({ [CHANNEL_A]: [] });
    await cleanupOldSoftresMessages(client);

    expect(client.channels.fetch).not.toHaveBeenCalled();

    (envModule.config as { threadCleanupEnabled: boolean }).threadCleanupEnabled = true;
  });

  it("skips a channel that isn't text-based, without throwing", async () => {
    const client = fakeClient({ [CHANNEL_A]: null });
    await expect(cleanupOldSoftresMessages(client)).resolves.toBeUndefined();
  });

  it("continues to other channels when one channel doesn't resolve", async () => {
    const envModule = await import("../../config/env.js");
    (envModule.config as { discordRaidSrChannelIds: string[] }).discordRaidSrChannelIds = [
      CHANNEL_A,
      CHANNEL_B,
    ];

    const oldDel = vi.fn().mockResolvedValue(undefined);
    const newestB = fakeMessage({ id: "newest-b", title: "SRs : Naxx" });
    const oldB = fakeMessage({
      id: "old-b",
      title: "SRs : Ony",
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
      delete: oldDel,
    });
    // CHANNEL_A's fetch resolves to undefined (e.g. an unknown/deleted channel ID),
    // CHANNEL_B has real messages and should still be processed.
    const client = fakeClient({ [CHANNEL_B]: [oldB, newestB] });

    await cleanupOldSoftresMessages(client);

    expect(oldDel).toHaveBeenCalledTimes(1);

    (envModule.config as { discordRaidSrChannelIds: string[] }).discordRaidSrChannelIds = [
      CHANNEL_A,
    ];
  });

  it("logs and continues when an individual message delete fails", async () => {
    const failingDel = vi.fn().mockRejectedValue(new Error("missing permissions"));
    const newest = fakeMessage({ id: "newest", title: "SRs : AQ40" });
    const old = fakeMessage({
      id: "old",
      title: "SRs : BWL/MC",
      createdTimestamp: NOW.getTime() - 10 * DAY_MS,
      delete: failingDel,
    });
    const client = fakeClient({ [CHANNEL_A]: [old, newest] });

    await expect(cleanupOldSoftresMessages(client)).resolves.toBeUndefined();
    expect(failingDel).toHaveBeenCalledTimes(1);
  });
});
