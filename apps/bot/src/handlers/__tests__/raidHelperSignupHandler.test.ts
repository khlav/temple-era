import { ComponentType, type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleRaidHelperSignup } from "../raidHelperSignupHandler.js";
import { logger } from "../../config/logger.js";

// vi.mock factories are hoisted above the rest of this module, so the ids they close over
// must be declared through vi.hoisted rather than as plain top-level consts.
const { RAID_HELPER_BOT_ID, OTHER_USER_ID, SR_CHANNEL_ID, OTHER_CHANNEL_ID, TOKEN_THREAD_ID } =
  vi.hoisted(() => ({
    RAID_HELPER_BOT_ID: "111111111111111111",
    OTHER_USER_ID: "999999999999999999",
    SR_CHANNEL_ID: "222222222222222222",
    OTHER_CHANNEL_ID: "444444444444444444",
    TOKEN_THREAD_ID: "333333333333333333",
  }));

vi.mock("../../config/env.js", () => ({
  config: {
    apiBaseUrl: "https://example.test",
    templeWebApiToken: "test-token",
    discordRaidHelperBotId: RAID_HELPER_BOT_ID,
    discordRaidSrChannelIds: [SR_CHANNEL_ID],
    discordSoftresTokenThreadId: TOKEN_THREAD_ID,
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
}): Message {
  return {
    id: overrides.id,
    channelId: overrides.channelId ?? SR_CHANNEL_ID,
    author: { id: overrides.authorId, bot: true, tag: "Raid-Helper#0000" },
    components: overrides.components ?? signupComponents(),
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
    fetchMock.mockResolvedValue(jsonResponse({ success: true, created: false, links: [] }));
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

  it("does not post to the Token thread when created is false", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, created: false, links: [] }));
    const threadFetch = vi.fn();
    const message = fakeMessage({ id: "5", authorId: RAID_HELPER_BOT_ID, threadFetch });

    await handleRaidHelperSignup(message);

    expect(threadFetch).not.toHaveBeenCalled();
  });

  it("posts the admin link to the Token thread for each created SoftRes", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        created: true,
        links: [
          {
            zone: "Molten Core",
            instanceId: 1,
            adminUrl: "https://softres.it/mc-admin",
            eventDate: "Sunday 09/13/2026",
          },
          {
            zone: "Blackwing Lair",
            instanceId: 2,
            adminUrl: "https://softres.it/bwl-admin",
            eventDate: "Sunday 09/13/2026",
          },
        ],
      }),
    );
    const send = vi.fn().mockResolvedValue(undefined);
    const threadFetch = vi.fn().mockResolvedValue({ isSendable: () => true, send });
    const message = fakeMessage({ id: "6", authorId: RAID_HELPER_BOT_ID, threadFetch });

    await handleRaidHelperSignup(message);

    expect(threadFetch).toHaveBeenCalledWith(TOKEN_THREAD_ID);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(
      1,
      "Molten Core Sunday 09/13/2026: https://softres.it/mc-admin",
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      "Blackwing Lair Sunday 09/13/2026: https://softres.it/bwl-admin",
    );
  });

  it("skips a duplicate message id without a second fetch call", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, created: false, links: [] }));
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

  it("logs and returns without posting when the Token thread is not fetchable", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        created: true,
        links: [
          {
            zone: "Molten Core",
            instanceId: 1,
            adminUrl: "https://softres.it/mc-admin",
            eventDate: "Sunday 09/13/2026",
          },
        ],
      }),
    );
    const threadFetch = vi.fn().mockResolvedValue(null);
    const message = fakeMessage({ id: "11", authorId: RAID_HELPER_BOT_ID, threadFetch });

    await handleRaidHelperSignup(message);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: TOKEN_THREAD_ID }),
      "SoftRes Token thread channel is not fetchable or not sendable",
    );
  });
});
