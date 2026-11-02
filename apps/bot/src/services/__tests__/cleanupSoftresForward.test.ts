import { buildWeeklyBlockEmbed } from "@temple-era/softres-blocks";
import { Collection, type Client, type Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupEventTimestampSec,
  forwardWeekSoftresToCleanup,
  pickWeekRaidId,
} from "../cleanupSoftresForward.js";

const { SR_CHANNEL, OTHER_SR_CHANNEL, CLEANUP_CHANNEL } = vi.hoisted(() => ({
  SR_CHANNEL: "sr-channel",
  OTHER_SR_CHANNEL: "other-sr-channel",
  CLEANUP_CHANNEL: "cleanup-channel",
}));

vi.mock("../../config/env.js", () => ({
  config: {
    discordRaidSrChannelIds: [OTHER_SR_CHANNEL, SR_CHANNEL],
    discordServerId: "server",
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../zoneEmoji.js", () => ({ getZoneEmoji: () => undefined }));

const mockGetWeeklyBlockDescription = vi.fn();
vi.mock("../tokenThreadSummary.js", () => ({
  getWeeklyBlockDescription: (...args: unknown[]) => mockGetWeeklyBlockDescription(...args),
}));

const BOT_USER_ID = "bot-user";
// Tue 10/27/2026 8pm ET (the main Naxx night) and Sun 11/1 9:30pm ET (the clean-up) — one
// lockout week.
const TUE_8PM = 1793145600;
const SUN_930PM = 1793586600;

function block(entries: Array<{ zone: string; raidId: string; timestampSec: number }>) {
  return buildWeeklyBlockEmbed(
    undefined,
    entries.map((e) => ({
      zone: e.zone,
      url: `https://softres.it/raid/${e.raidId}?adminToken=tok`,
      timestampSec: e.timestampSec,
    })),
  ).description;
}

function srPost(id: string, raidId: string, authorId = BOT_USER_ID) {
  return {
    id,
    author: { id: authorId },
    embeds: [
      {
        title: "SRs : Naxx Tue 10/27",
        description: `Tue, Oct 27 at 8:00 PM Server Time\n\nNaxxramas: https://softres.it/raid/${raidId}`,
      },
    ],
    forward: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeCleanupSignup(channelMessages: Record<string, ReturnType<typeof srPost>[]>) {
  const send = vi.fn().mockResolvedValue(undefined);
  const client = {
    user: { id: BOT_USER_ID },
    channels: {
      fetch: vi.fn().mockImplementation((channelId: string) =>
        Promise.resolve({
          isTextBased: () => true,
          messages: {
            fetch: vi
              .fn()
              .mockImplementation(({ before }: { before?: string }) =>
                Promise.resolve(
                  new Collection(
                    before ? [] : (channelMessages[channelId] ?? []).map((m) => [m.id, m]),
                  ),
                ),
              ),
          },
        }),
      ),
    },
  } as unknown as Client;
  const message = {
    id: "cleanup-signup",
    channelId: CLEANUP_CHANNEL,
    createdTimestamp: 0,
    embeds: [{ description: "NAXX CLEANUP", fields: [{ value: `<t:${SUN_930PM}:D>` }] }],
    channel: { isSendable: () => true, send },
    client,
  } as unknown as Message;
  return { message, send };
}

describe("cleanupEventTimestampSec", () => {
  it("reads the event time from the Raid-Helper embed's date field", () => {
    const { message } = fakeCleanupSignup({});
    expect(cleanupEventTimestampSec(message)).toBe(SUN_930PM);
  });

  it("falls back to when the signup was posted", () => {
    const message = { embeds: [], createdTimestamp: TUE_8PM * 1000 } as unknown as Message;
    expect(cleanupEventTimestampSec(message)).toBe(TUE_8PM);
  });
});

describe("pickWeekRaidId", () => {
  it("takes the last Naxx SR at or before the clean-up", () => {
    const raids = [
      { raidId: "early", timestampSec: TUE_8PM },
      { raidId: "later", timestampSec: TUE_8PM + 86400 },
      { raidId: "after", timestampSec: SUN_930PM + 3600 },
    ];
    expect(pickWeekRaidId(raids, SUN_930PM)).toBe("later");
  });

  it("falls back to the week's first when every listed one is later, and undefined when none", () => {
    expect(pickWeekRaidId([{ raidId: "x", timestampSec: SUN_930PM + 60 }], SUN_930PM)).toBe("x");
    expect(pickWeekRaidId([], SUN_930PM)).toBeUndefined();
  });
});

describe("forwardWeekSoftresToCleanup", () => {
  beforeEach(() => {
    mockGetWeeklyBlockDescription.mockReset();
  });

  it("forwards the week's Naxx SR post into the clean-up channel", async () => {
    mockGetWeeklyBlockDescription.mockResolvedValue(
      block([
        { zone: "Molten Core", raidId: "mcRaid", timestampSec: TUE_8PM },
        { zone: "Naxxramas", raidId: "naxxRaid", timestampSec: TUE_8PM },
      ]),
    );
    const naxxPost = srPost("p2", "naxxRaid");
    const otherPost = srPost("p1", "mcRaid");
    const { message, send } = fakeCleanupSignup({
      [OTHER_SR_CHANNEL]: [otherPost],
      [SR_CHANNEL]: [naxxPost],
    });

    await forwardWeekSoftresToCleanup(message);

    // Looked up the clean-up's own lockout week, not "now".
    expect(mockGetWeeklyBlockDescription).toHaveBeenCalledWith(message.client, SUN_930PM);
    expect(naxxPost.forward).toHaveBeenCalledWith(message.channel);
    expect(otherPost.forward).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores a matching post someone other than the bot made", async () => {
    mockGetWeeklyBlockDescription.mockResolvedValue(
      block([{ zone: "Naxxramas", raidId: "naxxRaid", timestampSec: TUE_8PM }]),
    );
    const humanPost = srPost("p1", "naxxRaid", "someone-else");
    const { message, send } = fakeCleanupSignup({ [SR_CHANNEL]: [humanPost] });

    await forwardWeekSoftresToCleanup(message);

    expect(humanPost.forward).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("posts the public link itself when the original post can't be found", async () => {
    mockGetWeeklyBlockDescription.mockResolvedValue(
      block([{ zone: "Naxxramas", raidId: "naxxRaid", timestampSec: TUE_8PM }]),
    );
    const { message, send } = fakeCleanupSignup({});

    await forwardWeekSoftresToCleanup(message);

    expect(send).toHaveBeenCalledTimes(1);
    const [{ embeds }] = send.mock.calls[0] as [
      { embeds: Array<{ data: { description: string } }> },
    ];
    expect(embeds[0]!.data.description).toContain("Naxxramas: https://softres.it/raid/naxxRaid");
    // Never the admin link.
    expect(embeds[0]!.data.description).not.toContain("adminToken");
  });

  it("does nothing when the week has no Naxx SR", async () => {
    mockGetWeeklyBlockDescription.mockResolvedValue(
      block([{ zone: "Molten Core", raidId: "mcRaid", timestampSec: TUE_8PM }]),
    );
    const { message, send } = fakeCleanupSignup({});

    await forwardWeekSoftresToCleanup(message);

    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when the week has no block at all", async () => {
    mockGetWeeklyBlockDescription.mockResolvedValue(undefined);
    const { message, send } = fakeCleanupSignup({});

    await forwardWeekSoftresToCleanup(message);

    expect(send).not.toHaveBeenCalled();
  });
});
