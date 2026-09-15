import { ComponentType, type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleRaidHelperSignup,
  scheduleRaidHelperSignupCheck,
} from "../raidHelperSignupHandler.js";
import { logger } from "../../config/logger.js";

// vi.mock factories are hoisted above the rest of this module, so the ids they close over
// must be declared through vi.hoisted rather than as plain top-level consts.
const { RAID_HELPER_BOT_ID, OTHER_USER_ID, SR_CHANNEL_ID, OTHER_CHANNEL_ID, SERVER_ID } =
  vi.hoisted(() => ({
    RAID_HELPER_BOT_ID: "111111111111111111",
    OTHER_USER_ID: "999999999999999999",
    SR_CHANNEL_ID: "222222222222222222",
    OTHER_CHANNEL_ID: "444444444444444444",
    SERVER_ID: "555555555555555555",
  }));

vi.mock("../../config/env.js", () => ({
  config: {
    apiBaseUrl: "https://example.test",
    templeWebApiToken: "test-token",
    discordRaidHelperBotId: RAID_HELPER_BOT_ID,
    discordRaidSrChannelIds: [SR_CHANNEL_ID],
    discordServerId: SERVER_ID,
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockGetZoneEmoji = vi.fn().mockReturnValue(undefined);
vi.mock("../../services/zoneEmoji.js", () => ({
  getZoneEmoji: (...args: unknown[]) => mockGetZoneEmoji(...args),
}));

const mockPostWeeklyTokenEntries = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/tokenThreadSummary.js", () => ({
  postWeeklyTokenEntries: (...args: unknown[]) => mockPostWeeklyTokenEntries(...args),
}));

function signupComponents(): unknown[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        { type: ComponentType.Button, label: "Bench" },
        { type: ComponentType.Button, label: "Absence" },
      ],
    },
  ];
}

function rosterConfirmationComponents(): unknown[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        { type: ComponentType.Button, label: "Confirm" },
        { type: ComponentType.Button, label: "Cancel" },
      ],
    },
  ];
}

function fakeMessage(overrides: {
  id: string;
  authorId: string;
  channelId?: string;
  components?: unknown[];
  content?: string;
  embeds?: { title?: string; description?: string }[];
  channelSend?: ReturnType<typeof vi.fn>;
  channelSendable?: boolean;
  fetch?: ReturnType<typeof vi.fn>;
}): Message {
  const channelId = overrides.channelId ?? SR_CHANNEL_ID;
  const message = {
    id: overrides.id,
    channelId,
    author: { id: overrides.authorId, bot: true, tag: "Raid-Helper#0000" },
    content: overrides.content ?? "",
    embeds: overrides.embeds ?? [],
    components: overrides.components ?? signupComponents(),
    channel: {
      isSendable: () => overrides.channelSendable ?? true,
      send: overrides.channelSend ?? vi.fn().mockResolvedValue(undefined),
    },
    client: {},
  } as unknown as Message;
  // Defaults to resolving with itself — matches the common case where the fresh fetch after the
  // delay carries the same shape the test already set up (e.g. signupComponents()).
  (message as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch =
    overrides.fetch ?? vi.fn().mockResolvedValue(message);
  return message;
}

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) } as Response;
}

describe("scheduleRaidHelperSignupCheck", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("ignores a message from a non-Raid-Helper author — no timer scheduled, no re-fetch ever", async () => {
    const message = fakeMessage({ id: "1", authorId: OTHER_USER_ID });
    scheduleRaidHelperSignupCheck(message);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(message.fetch).not.toHaveBeenCalled();
  });

  it("ignores a Raid-Helper message in an unconfigured channel — no timer scheduled, no re-fetch ever", async () => {
    const message = fakeMessage({
      id: "2",
      authorId: RAID_HELPER_BOT_ID,
      channelId: OTHER_CHANNEL_ID,
    });
    scheduleRaidHelperSignupCheck(message);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(message.fetch).not.toHaveBeenCalled();
  });

  it("logs the sighting immediately, before the delayed re-fetch fires", () => {
    const message = fakeMessage({ id: "1b", authorId: RAID_HELPER_BOT_ID });
    scheduleRaidHelperSignupCheck(message);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "1b" }),
      "Saw a message in a monitored SR channel",
    );
    expect(message.fetch).not.toHaveBeenCalled();
  });

  it("re-fetches after the first backoff delay (5s) and proceeds when the fresh copy already has a Bench button", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, created: false, links: [], eventTitle: "Thursday Onyxia" }),
    );
    const message = fakeMessage({ id: "1c", authorId: RAID_HELPER_BOT_ID });

    scheduleRaidHelperSignupCheck(message);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(message.fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/discord/ensure-softres",
      expect.objectContaining({ body: JSON.stringify({ eventId: "1c" }) }),
    );
  });

  it("retries on the 5s/10s/20s/60s backoff until the fresh copy has a Bench button", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, created: false, links: [], eventTitle: "Thursday Onyxia" }),
    );
    const staleMessage = fakeMessage({ id: "1f", authorId: RAID_HELPER_BOT_ID });
    const freshFetch = vi
      .fn()
      .mockResolvedValueOnce(
        fakeMessage({
          id: "1f",
          authorId: RAID_HELPER_BOT_ID,
          components: rosterConfirmationComponents(),
        }),
      )
      .mockResolvedValueOnce(
        fakeMessage({
          id: "1f",
          authorId: RAID_HELPER_BOT_ID,
          components: rosterConfirmationComponents(),
        }),
      )
      .mockResolvedValueOnce(
        fakeMessage({ id: "1f", authorId: RAID_HELPER_BOT_ID }), // default signupComponents()
      );
    (staleMessage as unknown as { fetch: typeof freshFetch }).fetch = freshFetch;

    scheduleRaidHelperSignupCheck(staleMessage);
    // 5s (no button) -> 10s (no button) -> 20s (button found, proceeds)
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000);

    expect(freshFetch).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/discord/ensure-softres",
      expect.objectContaining({ body: JSON.stringify({ eventId: "1f" }) }),
    );
  });

  it("gives up (no ensure-softres call) after exhausting all four retries with no Bench button", async () => {
    const staleMessage = fakeMessage({
      id: "1d",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
    });
    const freshFetch = vi.fn().mockResolvedValue(
      fakeMessage({
        id: "1d",
        authorId: RAID_HELPER_BOT_ID,
        components: rosterConfirmationComponents(),
      }),
    );
    (staleMessage as unknown as { fetch: typeof freshFetch }).fetch = freshFetch;

    scheduleRaidHelperSignupCheck(staleMessage);
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 60_000);

    expect(freshFetch).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "1d" }),
      "Raid Helper message still has no Bench button after all retries, giving up",
    );
  });

  it("treats a failed re-fetch as one retry, not a permanent failure — a later attempt can still succeed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, created: false, links: [], eventTitle: "Thursday Onyxia" }),
    );
    const message = fakeMessage({
      id: "1e",
      authorId: RAID_HELPER_BOT_ID,
      fetch: vi
        .fn()
        .mockRejectedValueOnce(new Error("message deleted"))
        .mockResolvedValueOnce(fakeMessage({ id: "1e", authorId: RAID_HELPER_BOT_ID })),
    });

    scheduleRaidHelperSignupCheck(message);
    await vi.advanceTimersByTimeAsync(5_000 + 10_000);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "message deleted", eventId: "1e", giving_up: false }),
      "Could not re-fetch Raid Helper signup message before checking for a Bench button",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/discord/ensure-softres",
      expect.objectContaining({ body: JSON.stringify({ eventId: "1e" }) }),
    );
  });

  it("logs a final giving-up failure and returns without throwing when every re-fetch attempt rejects", async () => {
    const message = fakeMessage({
      id: "1g",
      authorId: RAID_HELPER_BOT_ID,
      fetch: vi.fn().mockRejectedValue(new Error("message deleted")),
    });

    scheduleRaidHelperSignupCheck(message);
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 60_000);

    expect(message.fetch).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: "message deleted", eventId: "1g", giving_up: true }),
      "Could not re-fetch Raid Helper signup message before checking for a Bench button",
    );
  });
});

describe("handleRaidHelperSignup", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockGetZoneEmoji.mockReturnValue(undefined);
    mockPostWeeklyTokenEntries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("ignores a roster confirmation post (no Bench button), with no fetch call", async () => {
    const message = fakeMessage({
      id: "3",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
    });
    await handleRaidHelperSignup(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies a signup post and calls ensure-softres", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, created: false, links: [], eventTitle: "Thursday Onyxia" }),
    );
    const message = fakeMessage({ id: "4", authorId: RAID_HELPER_BOT_ID });

    await handleRaidHelperSignup(message);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/discord/ensure-softres",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ eventId: "4" }),
      }),
    );
  });

  it("does not post anywhere when created is false", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, created: false, links: [], eventTitle: "Thursday Onyxia" }),
    );
    const channelSend = vi.fn();
    const message = fakeMessage({
      id: "5",
      authorId: RAID_HELPER_BOT_ID,
      channelSend,
    });

    await handleRaidHelperSignup(message);

    expect(mockPostWeeklyTokenEntries).not.toHaveBeenCalled();
    expect(channelSend).not.toHaveBeenCalled();
  });

  it("posts a public embed to the signup channel and merges admin link(s) into the weekly Token thread summary", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        created: true,
        eventTitle: "Sunday BWL/MC @7PM",
        links: [
          {
            zone: "Blackwing Lair",
            instanceId: 3,
            adminUrl: "https://softres.it/bwl-admin",
            publicUrl: "https://softres.it/bwl-public",
            eventDate: "Sun, Sep 13 at 7:00 PM Server Time",
            eventTimestamp: 1757784000,
          },
          {
            zone: "Molten Core",
            instanceId: 2,
            adminUrl: "https://softres.it/mc-admin",
            publicUrl: "https://softres.it/mc-public",
            eventDate: "Sun, Sep 13 at 7:00 PM Server Time",
            eventTimestamp: 1757784000,
          },
        ],
      }),
    );
    const channelSend = vi.fn().mockResolvedValue(undefined);
    const message = fakeMessage({
      id: "6",
      authorId: RAID_HELPER_BOT_ID,
      channelSend,
    });

    await handleRaidHelperSignup(message);

    const expectedTitleUrl = `https://discord.com/channels/${SERVER_ID}/${SR_CHANNEL_ID}/6`;

    expect(channelSend).toHaveBeenCalledTimes(1);
    const publicEmbed = (
      channelSend.mock.calls[0]![0] as { embeds: { toJSON(): unknown }[] }
    ).embeds[0]!.toJSON() as { title: string; url: string; description: string; color: number };
    expect(publicEmbed.title).toBe("SRs : Sunday BWL/MC @7PM");
    expect(publicEmbed.url).toBe(expectedTitleUrl);
    expect(publicEmbed.description).toBe(
      "Sun, Sep 13 at 7:00 PM Server Time\n\nBlackwing Lair: https://softres.it/bwl-public\nMolten Core: https://softres.it/mc-public",
    );

    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledWith(message.client, [
      {
        zone: "Blackwing Lair",
        url: "https://softres.it/bwl-admin",
        emoji: undefined,
        timestampSec: 1757784000,
      },
      {
        zone: "Molten Core",
        url: "https://softres.it/mc-admin",
        emoji: undefined,
        timestampSec: 1757784000,
      },
    ]);
  });

  it("prefixes each zone line with that zone's emoji when one is available", async () => {
    mockGetZoneEmoji.mockImplementation((zone: string) =>
      zone === "Molten Core" ? "<:mc:222222222222222222>" : undefined,
    );
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        created: true,
        eventTitle: "Sunday BWL/MC @7PM",
        links: [
          {
            zone: "Blackwing Lair",
            instanceId: 3,
            adminUrl: "https://softres.it/bwl-admin",
            publicUrl: "https://softres.it/bwl-public",
            eventDate: "Sun, Sep 13 at 7:00 PM Server Time",
            eventTimestamp: 1757784000,
          },
          {
            zone: "Molten Core",
            instanceId: 2,
            adminUrl: "https://softres.it/mc-admin",
            publicUrl: "https://softres.it/mc-public",
            eventDate: "Sun, Sep 13 at 7:00 PM Server Time",
            eventTimestamp: 1757784000,
          },
        ],
      }),
    );
    const channelSend = vi.fn().mockResolvedValue(undefined);
    const message = fakeMessage({
      id: "13",
      authorId: RAID_HELPER_BOT_ID,
      channelSend,
    });

    await handleRaidHelperSignup(message);

    const publicEmbed = (
      channelSend.mock.calls[0]![0] as { embeds: { toJSON(): { description: string } }[] }
    ).embeds[0]!.toJSON();
    expect(publicEmbed.description).toBe(
      "Sun, Sep 13 at 7:00 PM Server Time\n\nBlackwing Lair: https://softres.it/bwl-public\n<:mc:222222222222222222> Molten Core: https://softres.it/mc-public",
    );
    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledWith(message.client, [
      {
        zone: "Blackwing Lair",
        url: "https://softres.it/bwl-admin",
        emoji: undefined,
        timestampSec: 1757784000,
      },
      {
        zone: "Molten Core",
        url: "https://softres.it/mc-admin",
        emoji: "<:mc:222222222222222222>",
        timestampSec: 1757784000,
      },
    ]);
  });

  it("skips a duplicate message id without a second fetch call", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, created: false, links: [], eventTitle: "Thursday Onyxia" }),
    );
    const message = fakeMessage({ id: "7", authorId: RAID_HELPER_BOT_ID });

    await handleRaidHelperSignup(message);
    await handleRaidHelperSignup(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logs and returns without throwing on a malformed ensure-softres response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: "shape" }));
    const message = fakeMessage({ id: "8", authorId: RAID_HELPER_BOT_ID });

    await expect(handleRaidHelperSignup(message)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/discord/ensure-softres", eventId: "8" }),
      "Unexpected response shape from ensure-softres",
    );
    expect(mockPostWeeklyTokenEntries).not.toHaveBeenCalled();
  });

  it("logs and returns without throwing when ensure-softres reports failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: "no active event" }));
    const message = fakeMessage({ id: "9", authorId: RAID_HELPER_BOT_ID });

    await expect(handleRaidHelperSignup(message)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "9", error: "no active event" }),
      "ensure-softres reported failure",
    );
  });

  it("logs and returns without throwing when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const message = fakeMessage({ id: "10", authorId: RAID_HELPER_BOT_ID });

    await expect(handleRaidHelperSignup(message)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "10", error: "network down" }),
      "Error ensuring SoftRes link",
    );
  });

  it("logs but still merges the admin link into the Token thread summary when the signup channel is not sendable", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        created: true,
        eventTitle: "Thursday Onyxia",
        links: [
          {
            zone: "Onyxia",
            instanceId: 1,
            adminUrl: "https://softres.it/mc-admin",
            publicUrl: "https://softres.it/mc-public",
            eventDate: "Sunday 09/13/2026",
            eventTimestamp: 1757784000,
          },
        ],
      }),
    );
    const channelSend = vi.fn();
    const message = fakeMessage({
      id: "11",
      authorId: RAID_HELPER_BOT_ID,
      channelSend,
      channelSendable: false,
    });

    await handleRaidHelperSignup(message);

    expect(channelSend).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: SR_CHANNEL_ID }),
      "Raid signup channel is not sendable",
    );
    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledTimes(1);
  });

  it("logs without throwing when merging into the Token thread summary rejects", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        created: true,
        eventTitle: "Thursday Onyxia",
        links: [
          {
            zone: "Onyxia",
            instanceId: 1,
            adminUrl: "https://softres.it/mc-admin",
            publicUrl: "https://softres.it/mc-public",
            eventDate: "Sunday 09/13/2026",
            eventTimestamp: 1757784000,
          },
        ],
      }),
    );
    mockPostWeeklyTokenEntries.mockRejectedValue(new Error("token thread down"));
    const message = fakeMessage({ id: "12", authorId: RAID_HELPER_BOT_ID });

    await expect(handleRaidHelperSignup(message)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "token thread down", eventId: "12" }),
      "Error ensuring SoftRes link",
    );
  });
});
