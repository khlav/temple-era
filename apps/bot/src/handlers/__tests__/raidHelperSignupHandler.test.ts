import { ComponentType, type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleRaidHelperSignup } from "../raidHelperSignupHandler.js";
import { logger } from "../../config/logger.js";

// vi.mock factories are hoisted above the rest of this module, so the ids they close over
// must be declared through vi.hoisted rather than as plain top-level consts.
const {
  RAID_HELPER_BOT_ID,
  OTHER_USER_ID,
  SR_CHANNEL_ID,
  OTHER_CHANNEL_ID,
  TOKEN_THREAD_ID,
  SERVER_ID,
} = vi.hoisted(() => ({
  RAID_HELPER_BOT_ID: "111111111111111111",
  OTHER_USER_ID: "999999999999999999",
  SR_CHANNEL_ID: "222222222222222222",
  OTHER_CHANNEL_ID: "444444444444444444",
  TOKEN_THREAD_ID: "333333333333333333",
  SERVER_ID: "555555555555555555",
}));

vi.mock("../../config/env.js", () => ({
  config: {
    apiBaseUrl: "https://example.test",
    templeWebApiToken: "test-token",
    discordRaidHelperBotId: RAID_HELPER_BOT_ID,
    discordRaidSrChannelIds: [SR_CHANNEL_ID],
    discordSoftresTokenThreadId: TOKEN_THREAD_ID,
    discordServerId: SERVER_ID,
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
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
  threadFetch?: ReturnType<typeof vi.fn>;
  channelSend?: ReturnType<typeof vi.fn>;
  channelSendable?: boolean;
}): Message {
  const channelId = overrides.channelId ?? SR_CHANNEL_ID;
  return {
    id: overrides.id,
    channelId,
    author: { id: overrides.authorId, bot: true, tag: "Raid-Helper#0000" },
    components: overrides.components ?? signupComponents(),
    channel: {
      isSendable: () => overrides.channelSendable ?? true,
      send: overrides.channelSend ?? vi.fn().mockResolvedValue(undefined),
    },
    client: {
      channels: { fetch: overrides.threadFetch ?? vi.fn() },
    },
  } as unknown as Message;
}

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) } as Response;
}

describe("handleRaidHelperSignup", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("ignores a message from a non-Raid-Helper author, with no fetch call", async () => {
    const message = fakeMessage({ id: "1", authorId: OTHER_USER_ID });
    await handleRaidHelperSignup(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a Raid-Helper message in an unconfigured channel, with no fetch call", async () => {
    const message = fakeMessage({
      id: "2",
      authorId: RAID_HELPER_BOT_ID,
      channelId: OTHER_CHANNEL_ID,
    });
    await handleRaidHelperSignup(message);
    expect(fetchMock).not.toHaveBeenCalled();
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
    const threadFetch = vi.fn();
    const channelSend = vi.fn();
    const message = fakeMessage({
      id: "5",
      authorId: RAID_HELPER_BOT_ID,
      threadFetch,
      channelSend,
    });

    await handleRaidHelperSignup(message);

    expect(threadFetch).not.toHaveBeenCalled();
    expect(channelSend).not.toHaveBeenCalled();
  });

  it("posts a public embed to the signup channel and an admin embed to the Token thread", async () => {
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
          },
          {
            zone: "Molten Core",
            instanceId: 2,
            adminUrl: "https://softres.it/mc-admin",
            publicUrl: "https://softres.it/mc-public",
            eventDate: "Sun, Sep 13 at 7:00 PM Server Time",
          },
        ],
      }),
    );
    const threadSend = vi.fn().mockResolvedValue(undefined);
    const threadFetch = vi.fn().mockResolvedValue({ isSendable: () => true, send: threadSend });
    const channelSend = vi.fn().mockResolvedValue(undefined);
    const message = fakeMessage({
      id: "6",
      authorId: RAID_HELPER_BOT_ID,
      threadFetch,
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

    expect(threadFetch).toHaveBeenCalledWith(TOKEN_THREAD_ID);
    expect(threadSend).toHaveBeenCalledTimes(1);
    const adminEmbed = (
      threadSend.mock.calls[0]![0] as { embeds: { toJSON(): unknown }[] }
    ).embeds[0]!.toJSON() as { title: string; description: string };
    expect(adminEmbed.title).toBe("SRs : Sunday BWL/MC @7PM");
    expect(adminEmbed.description).toBe(
      "Sun, Sep 13 at 7:00 PM Server Time\n\nBlackwing Lair: https://softres.it/bwl-admin\nMolten Core: https://softres.it/mc-admin",
    );
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
    const threadFetch = vi.fn();
    const message = fakeMessage({ id: "8", authorId: RAID_HELPER_BOT_ID, threadFetch });

    await expect(handleRaidHelperSignup(message)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/discord/ensure-softres", eventId: "8" }),
      "Unexpected response shape from ensure-softres",
    );
    expect(threadFetch).not.toHaveBeenCalled();
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

  it("logs but still posts the Token thread embed when the signup channel is not sendable", async () => {
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
          },
        ],
      }),
    );
    const threadSend = vi.fn().mockResolvedValue(undefined);
    const threadFetch = vi.fn().mockResolvedValue({ isSendable: () => true, send: threadSend });
    const channelSend = vi.fn();
    const message = fakeMessage({
      id: "11",
      authorId: RAID_HELPER_BOT_ID,
      threadFetch,
      channelSend,
      channelSendable: false,
    });

    await handleRaidHelperSignup(message);

    expect(channelSend).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: SR_CHANNEL_ID }),
      "Raid signup channel is not sendable",
    );
    expect(threadSend).toHaveBeenCalledTimes(1);
  });

  it("logs and returns without posting when the Token thread is not fetchable", async () => {
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
          },
        ],
      }),
    );
    const threadFetch = vi.fn().mockResolvedValue(null);
    const message = fakeMessage({ id: "12", authorId: RAID_HELPER_BOT_ID, threadFetch });

    await handleRaidHelperSignup(message);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: TOKEN_THREAD_ID }),
      "SoftRes Token thread channel is not fetchable or not sendable",
    );
  });
});
