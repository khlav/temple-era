import { type Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleMessageUpdate } from "../messageUpdateHandler.js";
import { cancelPendingLogRetry, startPendingLogRetries } from "../../services/pendingLogRetry.js";
import { requestRaidCreation } from "../../services/raidCreation.js";
import { checkUserPermissions } from "../../services/permissionChecker.js";

const { LOGS_CHANNEL_ID } = vi.hoisted(() => ({ LOGS_CHANNEL_ID: "1188018250227908638" }));

vi.mock("../../config/env.js", () => ({
  config: {
    apiBaseUrl: "https://example.test",
    templeWebApiToken: "test-token",
    discordLogsChannelId: LOGS_CHANNEL_ID,
  },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../services/permissionChecker.js", () => ({ checkUserPermissions: vi.fn() }));
vi.mock("../../services/raidCreation.js", () => ({ requestRaidCreation: vi.fn() }));
vi.mock("../../services/pendingLogRetry.js", () => ({
  cancelPendingLogRetry: vi.fn(),
  startPendingLogRetries: vi.fn(),
}));

const cancelMock = vi.mocked(cancelPendingLogRetry);
const startMock = vi.mocked(startPendingLogRetries);
const createMock = vi.mocked(requestRaidCreation);
const permissionsMock = vi.mocked(checkUserPermissions);

const NEW_URL = "https://vanilla.warcraftlogs.com/reports/aaaaaaaaaaaaaaaa";
const OLD_URL = "https://vanilla.warcraftlogs.com/reports/bbbbbbbbbbbbbbbb";

/**
 * The handler dedupes on `messageId-editedTimestamp`, and these tests run inside the same
 * millisecond, so each one needs its own message id or the second would be skipped as a repeat.
 */
let nextMessageId = 1572419528443437207n;

function makeMessages(threadOverrides: Record<string, unknown> = {}) {
  const messageId = (nextMessageId++).toString();
  const thread = {
    id: "thread-1",
    name: "Raid: Naxx 11/17",
    send: vi.fn().mockResolvedValue(undefined),
    setName: vi.fn().mockResolvedValue(undefined),
    ...threadOverrides,
  };
  const newMessage = {
    id: messageId,
    content: `Naxx 11/17 ${NEW_URL}`,
    channelId: LOGS_CHANNEL_ID,
    channel: { isThread: () => false },
    author: { bot: false, id: "124297960560263174", tag: "goodoldloons" },
    editedTimestamp: Date.now(),
    createdTimestamp: Date.now() - 60_000,
    thread,
  } as unknown as Message;
  const oldMessage = { content: `Naxx 11/17 ${OLD_URL}` } as unknown as Message;
  return { newMessage, oldMessage, thread };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionsMock.mockResolvedValue({
    success: true,
    hasAccount: true,
    canManageRaidLogs: true,
  } as Awaited<ReturnType<typeof checkUserPermissions>>);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleMessageUpdate — editing a log that is still waiting on Warcraft Logs", () => {
  it("re-points the wait at the replacement link instead of calling update-raid", async () => {
    // update-raid would answer "No raid found" — a pending log has written no raid_log row — and
    // the original retry would then have created the raid from the link that was just replaced.
    cancelMock.mockReturnValue(true);
    createMock.mockResolvedValue({
      kind: "created",
      isNew: true,
      raidId: 971,
      raidName: "Naxx 11/17",
      raidUrl: "https://www.temple-era.com/raids/971/naxx-11-17",
    });
    const { newMessage, oldMessage, thread } = makeMessages();

    await handleMessageUpdate(oldMessage, newMessage);

    expect(cancelMock).toHaveBeenCalledWith(newMessage.id);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ wclUrl: NEW_URL, discordMessageId: newMessage.id }),
      expect.anything(),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(thread.send).toHaveBeenCalledWith("https://www.temple-era.com/raids/971/naxx-11-17");
  });

  it("resumes waiting when the replacement link is also still incomplete", async () => {
    cancelMock.mockReturnValue(true);
    createMock.mockResolvedValue({ kind: "incomplete" });
    const { newMessage, oldMessage } = makeMessages();

    await handleMessageUpdate(oldMessage, newMessage);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ wclUrl: NEW_URL }));
  });

  it("resumes waiting on a retryable failure rather than dropping the window", async () => {
    // The timer was already cancelled by this point, so treating a blip as terminal would lose the
    // rest of the hour outright.
    cancelMock.mockReturnValue(true);
    createMock.mockResolvedValue({ kind: "failed", error: "fetch failed", retryable: true });
    const { newMessage, oldMessage, thread } = makeMessages();

    await handleMessageUpdate(oldMessage, newMessage);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(thread.send).not.toHaveBeenCalled();
  });

  it("reports a terminal failure in the thread", async () => {
    cancelMock.mockReturnValue(true);
    createMock.mockResolvedValue({
      kind: "failed",
      error: "User does not have raid manager permissions",
      retryable: false,
    });
    const { newMessage, oldMessage, thread } = makeMessages();

    await handleMessageUpdate(oldMessage, newMessage);

    expect(startMock).not.toHaveBeenCalled();
    expect(thread.send).toHaveBeenCalledWith(
      "❌ Could not create the raid: User does not have raid manager permissions",
    );
  });

  it("does not let a Discord failure escape and kill the process", async () => {
    // This path runs outside the handler's own try block, and an unhandled rejection is fatal for
    // the bot.
    cancelMock.mockReturnValue(true);
    createMock.mockResolvedValue({
      kind: "created",
      isNew: true,
      raidId: 971,
      raidName: "Naxx 11/17",
      raidUrl: "https://www.temple-era.com/raids/971/naxx-11-17",
    });
    const { newMessage, oldMessage } = makeMessages({
      send: vi.fn().mockRejectedValue(new Error("Missing Permissions")),
    });

    await expect(handleMessageUpdate(oldMessage, newMessage)).resolves.toBeUndefined();
  });

  it("leaves an ordinary edit on the update-raid path", async () => {
    cancelMock.mockReturnValue(false);
    const { newMessage, oldMessage } = makeMessages();

    await handleMessageUpdate(oldMessage, newMessage);

    expect(createMock).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/api/discord/update-raid",
      expect.anything(),
    );
  });
});
