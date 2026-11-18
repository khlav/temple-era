import { type AnyThreadChannel } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GAVE_UP_MESSAGE,
  cancelPendingLogRetry,
  MAX_ATTEMPTS,
  RETRY_INTERVAL_MS,
  WAITING_MESSAGE,
  cancelAllPendingLogRetries,
  pendingLogRetryCount,
  startPendingLogRetries,
} from "../pendingLogRetry.js";
import { requestRaidCreation } from "../raidCreation.js";

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../raidCreation.js", () => ({ requestRaidCreation: vi.fn() }));

const requestRaidCreationMock = vi.mocked(requestRaidCreation);

const body = {
  discordUserId: "124297960560263174",
  wclUrl: "https://vanilla.warcraftlogs.com/reports/Zv2tDV94PJ16gayB",
  discordMessageId: "1572419528443437207",
};

function makeThread() {
  return {
    id: "thread-1",
    name: "Raid: Naxx 11/17",
    send: vi.fn().mockResolvedValue(undefined),
    setName: vi.fn().mockResolvedValue(undefined),
  } as unknown as AnyThreadChannel & {
    send: ReturnType<typeof vi.fn>;
    setName: ReturnType<typeof vi.fn>;
  };
}

/** Run every pending timer and let the promises each one starts settle. */
async function advanceOneInterval() {
  await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  requestRaidCreationMock.mockReset();
});

afterEach(() => {
  cancelAllPendingLogRetries();
  vi.useRealTimers();
});

describe("startPendingLogRetries", () => {
  it("tells the thread it is waiting, without creating a raid yet", async () => {
    requestRaidCreationMock.mockResolvedValue({ kind: "incomplete" });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await vi.advanceTimersByTimeAsync(0);

    expect(thread.send).toHaveBeenCalledWith(WAITING_MESSAGE);
    expect(requestRaidCreationMock).not.toHaveBeenCalled();
  });

  it("posts the raid link in the same thread once boss data lands", async () => {
    requestRaidCreationMock.mockResolvedValueOnce({ kind: "incomplete" }).mockResolvedValueOnce({
      kind: "created",
      isNew: true,
      raidId: 971,
      raidName: "Naxx 11/17",
      raidUrl: "https://www.temple-era.com/raids/971/naxx-11-17",
    });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await advanceOneInterval();
    await advanceOneInterval();

    expect(requestRaidCreationMock).toHaveBeenCalledTimes(2);
    expect(thread.send).toHaveBeenCalledWith("https://www.temple-era.com/raids/971/naxx-11-17");
    expect(pendingLogRetryCount()).toBe(0);
  });

  it("renames the thread when the raid's name differs from the placeholder", async () => {
    requestRaidCreationMock.mockResolvedValue({
      kind: "created",
      isNew: true,
      raidId: 971,
      raidName: "Naxxramas",
      raidUrl: "https://www.temple-era.com/raids/971/naxxramas",
    });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await advanceOneInterval();

    expect(thread.setName).toHaveBeenCalledWith("Raid: Naxxramas");
  });

  it("does not rename when the placeholder already matches", async () => {
    requestRaidCreationMock.mockResolvedValue({
      kind: "created",
      isNew: true,
      raidId: 971,
      raidName: "Naxx 11/17",
      raidUrl: "https://www.temple-era.com/raids/971/naxx-11-17",
    });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await advanceOneInterval();

    expect(thread.setName).not.toHaveBeenCalled();
  });

  it("gives up after an hour and says so", async () => {
    requestRaidCreationMock.mockResolvedValue({ kind: "incomplete" });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await advanceOneInterval();

    expect(requestRaidCreationMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(thread.send).toHaveBeenCalledWith(GAVE_UP_MESSAGE);
    expect(pendingLogRetryCount()).toBe(0);

    // And it stays stopped.
    await advanceOneInterval();
    expect(requestRaidCreationMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("stops and reports when the retry hits a terminal failure", async () => {
    requestRaidCreationMock.mockResolvedValue({
      kind: "failed",
      error: "User does not have raid manager permissions",
      retryable: false,
    });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await advanceOneInterval();
    await advanceOneInterval();

    expect(requestRaidCreationMock).toHaveBeenCalledTimes(1);
    expect(thread.send).toHaveBeenCalledWith(
      "❌ Could not create the raid: User does not have raid manager permissions",
    );
  });

  it("ignores a second start for the same message", async () => {
    requestRaidCreationMock.mockResolvedValue({ kind: "incomplete" });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    startPendingLogRetries(thread, body);
    await vi.advanceTimersByTimeAsync(0);

    expect(thread.send).toHaveBeenCalledTimes(1);
    expect(pendingLogRetryCount()).toBe(1);
  });

  it("keeps waiting through a retryable failure rather than burning the window", async () => {
    // Temple briefly unreachable — a deploy, a DNS blip — must not cost the rest of the hour.
    requestRaidCreationMock
      .mockResolvedValueOnce({ kind: "failed", error: "fetch failed", retryable: true })
      .mockResolvedValueOnce({
        kind: "created",
        isNew: true,
        raidId: 971,
        raidName: "Naxx 11/17",
        raidUrl: "https://www.temple-era.com/raids/971/naxx-11-17",
      });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await advanceOneInterval();

    // No error posted for the blip.
    expect(thread.send).toHaveBeenCalledTimes(1);
    expect(thread.send).toHaveBeenLastCalledWith(WAITING_MESSAGE);

    await advanceOneInterval();
    expect(thread.send).toHaveBeenLastCalledWith("https://www.temple-era.com/raids/971/naxx-11-17");
  });

  it("reports an unreachable Temple API once the window is spent", async () => {
    requestRaidCreationMock.mockResolvedValue({
      kind: "failed",
      error: "fetch failed",
      retryable: true,
    });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await advanceOneInterval();

    expect(requestRaidCreationMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(thread.send).toHaveBeenLastCalledWith("❌ Could not create the raid: fetch failed");
  });

  it("clamps an over-long raid name to Discord's thread-name limit", async () => {
    requestRaidCreationMock.mockResolvedValue({
      kind: "created",
      isNew: true,
      raidId: 971,
      raidName: "N".repeat(200),
      raidUrl: "https://www.temple-era.com/raids/971/n",
    });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    await advanceOneInterval();

    const name = thread.setName.mock.calls[0]?.[0] as string;
    expect(name.length).toBe(100);
    expect(name.startsWith("Raid: NNN")).toBe(true);
  });

  it("cancelPendingLogRetry drops a scheduled retry and reports whether there was one", async () => {
    requestRaidCreationMock.mockResolvedValue({ kind: "incomplete" });
    const thread = makeThread();

    startPendingLogRetries(thread, body);
    expect(cancelPendingLogRetry(body.discordMessageId)).toBe(true);
    expect(pendingLogRetryCount()).toBe(0);

    await advanceOneInterval();
    expect(requestRaidCreationMock).not.toHaveBeenCalled();

    expect(cancelPendingLogRetry(body.discordMessageId)).toBe(false);
  });

  it("retries on a 15-minute cadence", async () => {
    requestRaidCreationMock.mockResolvedValue({ kind: "incomplete" });
    const thread = makeThread();

    startPendingLogRetries(thread, body);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS - 1000);
    expect(requestRaidCreationMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(requestRaidCreationMock).toHaveBeenCalledTimes(1);
  });
});
