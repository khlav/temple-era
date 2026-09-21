import { ComponentType, type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleRaidHelperRoster,
  handleRaidHelperSignup,
  scheduleRaidHelperSignupCheck,
} from "../raidHelperSignupHandler.js";
import { logger } from "../../config/logger.js";

// vi.mock factories are hoisted above the rest of this module, so the ids they close over
// must be declared through vi.hoisted rather than as plain top-level consts.
const {
  RAID_HELPER_BOT_ID,
  OTHER_USER_ID,
  SR_CHANNEL_ID,
  OTHER_CHANNEL_ID,
  SERVER_ID,
  BOT_USER_ID,
} = vi.hoisted(() => ({
  RAID_HELPER_BOT_ID: "111111111111111111",
  OTHER_USER_ID: "999999999999999999",
  SR_CHANNEL_ID: "222222222222222222",
  OTHER_CHANNEL_ID: "444444444444444444",
  SERVER_ID: "555555555555555555",
  BOT_USER_ID: "666666666666666666",
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
  embeds?: { title?: string; description?: string; url?: string }[];
  channelSend?: ReturnType<typeof vi.fn>;
  channelSendable?: boolean;
  channelMessagesFetch?: ReturnType<typeof vi.fn>;
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
      messages: {
        fetch: overrides.channelMessagesFetch ?? vi.fn().mockResolvedValue(new Map()),
      },
    },
    client: { user: { id: BOT_USER_ID } },
  } as unknown as Message;
  // Defaults to resolving with itself — matches the common case where the fresh fetch after the
  // delay carries the same shape the test already set up (e.g. signupComponents()).
  (message as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch =
    overrides.fetch ?? vi.fn().mockResolvedValue(message);
  return message;
}

/** A bot-authored SoftRes embed message, as returned from `channel.messages.fetch` — the shape
 *  `findSoftresEmbedForEvent` searches for. */
function fakeSoftresEmbedMessage(overrides: {
  id: string;
  embedUrl: string;
  forward?: ReturnType<typeof vi.fn>;
}): Message {
  return {
    id: overrides.id,
    author: { id: BOT_USER_ID, bot: true },
    createdTimestamp: Number(overrides.id),
    embeds: [{ title: "SRs : Sunday BWL/MC @7PM", url: overrides.embedUrl }],
    forward: overrides.forward ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as Message;
}

const EVENT_URL = `https://discord.com/channels/${SERVER_ID}/${SR_CHANNEL_ID}/999000000000000001`;

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
    const staleMessage = fakeMessage({ id: "1f", authorId: RAID_HELPER_BOT_ID, components: [] });
    const freshFetch = vi
      .fn()
      .mockResolvedValueOnce(
        fakeMessage({ id: "1f", authorId: RAID_HELPER_BOT_ID, components: [] }),
      )
      .mockResolvedValueOnce(
        fakeMessage({ id: "1f", authorId: RAID_HELPER_BOT_ID, components: [] }),
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

  it("gives up (no ensure-softres call) after exhausting all four retries with neither button type", async () => {
    const noButtonsMessage = fakeMessage({
      id: "1d",
      authorId: RAID_HELPER_BOT_ID,
      components: [],
    });
    const freshFetch = vi.fn().mockResolvedValue(
      fakeMessage({
        id: "1d",
        authorId: RAID_HELPER_BOT_ID,
        components: [],
      }),
    );
    (noButtonsMessage as unknown as { fetch: typeof freshFetch }).fetch = freshFetch;

    scheduleRaidHelperSignupCheck(noButtonsMessage);
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 60_000);

    expect(freshFetch).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "1d" }),
      "Raid Helper message still has no Bench or Confirm button after all retries, giving up",
    );
  });

  it("dispatches to the roster handler once a fresh fetch shows a Confirm button", async () => {
    const message = fakeMessage({
      id: "1h",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ title: "Sunday BWL/MC @7PM", url: EVENT_URL }],
    });

    scheduleRaidHelperSignupCheck(message);
    await vi.advanceTimersByTimeAsync(5_000);

    // Reaching this log (rather than the Bench-button ensure-softres path) confirms the retry
    // loop routed a Confirm-button message to the roster handler.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "1h" }),
      "No matching SoftRes embed found for this roster post",
    );
    expect(fetchMock).not.toHaveBeenCalled();
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

describe("handleRaidHelperRoster", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a message with no Confirm button, with no channel search", async () => {
    const channelMessagesFetch = vi.fn();
    const message = fakeMessage({
      id: "20",
      authorId: RAID_HELPER_BOT_ID,
      components: signupComponents(),
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);

    expect(channelMessagesFetch).not.toHaveBeenCalled();
  });

  it("skips a duplicate roster message id without a second channel search", async () => {
    const channelMessagesFetch = vi.fn().mockResolvedValue(new Map());
    const message = fakeMessage({
      id: "21",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ url: EVENT_URL }],
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);
    await handleRaidHelperRoster(message);

    expect(channelMessagesFetch).toHaveBeenCalledTimes(1);
  });

  it("warns and skips when neither the embed nor a button custom_id yields the original event", async () => {
    const channelMessagesFetch = vi.fn();
    const message = fakeMessage({
      id: "22",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(), // no custom_id set on the test fixture's buttons
      embeds: [{ title: "Sunday BWL/MC @7PM" }], // no .url
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);

    expect(channelMessagesFetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "22" }),
      "Could not resolve the original signup message from a Raid Helper roster post",
    );
  });

  it("resolves the event from a Confirm button's custom_id when the embed has no .url", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const srMessage = fakeSoftresEmbedMessage({
      id: "999000000000000002",
      embedUrl: EVENT_URL,
      forward,
    });
    const channelMessagesFetch = vi.fn().mockResolvedValue(new Map([[srMessage.id, srMessage]]));
    const message = fakeMessage({
      id: "23",
      authorId: RAID_HELPER_BOT_ID,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              label: "Confirm",
              customId: "confirm-999000000000000001-187282620059484160",
            },
            {
              type: ComponentType.Button,
              label: "Cancel",
              customId: "cancel-999000000000000001-187282620059484160",
            },
          ],
        },
      ],
      embeds: [{ title: "Sunday BWL/MC @7PM" }], // no .url — forces the custom_id fallback
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);

    expect(forward).toHaveBeenCalledWith(message.channel);
  });

  it("finds the matching SoftRes embed by event URL and forwards it into the roster channel", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const srMessage = fakeSoftresEmbedMessage({
      id: "999000000000000002",
      embedUrl: EVENT_URL,
      forward,
    });
    const otherBotMessage = fakeSoftresEmbedMessage({
      id: "999000000000000003",
      embedUrl: "https://discord.com/channels/different/event/link",
    });
    const channelMessagesFetch = vi.fn().mockResolvedValue(
      new Map([
        [otherBotMessage.id, otherBotMessage],
        [srMessage.id, srMessage],
      ]),
    );
    const message = fakeMessage({
      id: "24",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ title: "Sunday BWL/MC @7PM", url: EVENT_URL }],
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);

    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(message.channel);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "24", softresMessageId: srMessage.id }),
      "Forwarded the SoftRes embed after the roster post",
    );
  });

  it("paginates backwards through channel history until it finds the matching embed", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const srMessage = fakeSoftresEmbedMessage({
      id: "999000000000000002",
      embedUrl: EVENT_URL,
      forward,
    });
    const channelMessagesFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Map([["a", fakeSoftresEmbedMessage({ id: "1", embedUrl: "nope" })]]),
      )
      .mockResolvedValueOnce(new Map([[srMessage.id, srMessage]]));
    const message = fakeMessage({
      id: "25",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ url: EVENT_URL }],
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);

    expect(channelMessagesFetch).toHaveBeenCalledTimes(2);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("logs and gives up when channel history is exhausted with no matching embed", async () => {
    const channelMessagesFetch = vi.fn().mockResolvedValue(new Map());
    const message = fakeMessage({
      id: "26",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ url: EVENT_URL }],
      channelMessagesFetch,
    });

    await handleRaidHelperRoster(message);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "26" }),
      "No matching SoftRes embed found for this roster post",
    );
  });

  it("logs without throwing when forward() rejects", async () => {
    const forward = vi.fn().mockRejectedValue(new Error("cannot forward"));
    const srMessage = fakeSoftresEmbedMessage({
      id: "999000000000000002",
      embedUrl: EVENT_URL,
      forward,
    });
    const channelMessagesFetch = vi.fn().mockResolvedValue(new Map([[srMessage.id, srMessage]]));
    const message = fakeMessage({
      id: "27",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ url: EVENT_URL }],
      channelMessagesFetch,
    });

    await expect(handleRaidHelperRoster(message)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "cannot forward", eventId: "27" }),
      "Error forwarding SoftRes embed for roster post",
    );
  });

  it("logs and skips without forwarding when the roster channel is not sendable", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const srMessage = fakeSoftresEmbedMessage({
      id: "999000000000000002",
      embedUrl: EVENT_URL,
      forward,
    });
    const channelMessagesFetch = vi.fn().mockResolvedValue(new Map([[srMessage.id, srMessage]]));
    const message = fakeMessage({
      id: "28",
      authorId: RAID_HELPER_BOT_ID,
      components: rosterConfirmationComponents(),
      embeds: [{ url: EVENT_URL }],
      channelMessagesFetch,
      channelSendable: false,
    });

    await handleRaidHelperRoster(message);

    expect(forward).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: SR_CHANNEL_ID }),
      "Roster channel is not sendable",
    );
  });
});
