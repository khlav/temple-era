import { describe, it, expect } from "vitest";
import { findFollowUpSoftResRaidIds } from "../discord-helpers";
import type { DiscordMessageWithChannel } from "../discord-helpers";

function message(
  overrides: Partial<DiscordMessageWithChannel> & { channelId: string; timestamp: string },
): DiscordMessageWithChannel {
  return {
    id: "msg-id",
    content: "",
    author: { id: "author-id", username: "author" },
    ...overrides,
  };
}

describe("findFollowUpSoftResRaidIds", () => {
  const channelId = "channel-1";
  const eventStartMs = new Date("2026-08-15T00:00:00.000Z").getTime();

  it("picks up a softres.it link posted by a human RL within the lookback window", () => {
    const messages = [
      message({
        channelId,
        content: "here's the BWL link https://softres.it/raid/abc123",
        timestamp: "2026-08-14T23:00:00.000Z",
      }),
    ];

    expect(findFollowUpSoftResRaidIds(messages, channelId, eventStartMs, new Set())).toEqual([
      "abc123",
    ]);
  });

  it("finds both links of a doubleheader follow-up message", () => {
    const messages = [
      message({
        channelId,
        content: "BWL: https://softres.it/raid/bwl111 MC: https://softres.it/raid/mc222",
        timestamp: "2026-08-14T23:00:00.000Z",
      }),
    ];

    expect(findFollowUpSoftResRaidIds(messages, channelId, eventStartMs, new Set())).toEqual([
      "bwl111",
      "mc222",
    ]);
  });

  it("excludes raid IDs already known (e.g. from the event's own softresId)", () => {
    const messages = [
      message({
        channelId,
        content: "https://softres.it/raid/abc123",
        timestamp: "2026-08-14T23:00:00.000Z",
      }),
    ];

    expect(
      findFollowUpSoftResRaidIds(messages, channelId, eventStartMs, new Set(["abc123"])),
    ).toEqual([]);
  });

  it("ignores messages from other channels", () => {
    const messages = [
      message({
        channelId: "other-channel",
        content: "https://softres.it/raid/abc123",
        timestamp: "2026-08-14T23:00:00.000Z",
      }),
    ];

    expect(findFollowUpSoftResRaidIds(messages, channelId, eventStartMs, new Set())).toEqual([]);
  });

  it("ignores messages outside the lookback window", () => {
    const tooEarly = message({
      channelId,
      content: "https://softres.it/raid/tooearly",
      timestamp: "2026-08-01T00:00:00.000Z",
    });
    const afterStart = message({
      channelId,
      content: "https://softres.it/raid/afterstart",
      timestamp: "2026-08-15T01:00:00.000Z",
    });

    expect(
      findFollowUpSoftResRaidIds([tooEarly, afterStart], channelId, eventStartMs, new Set()),
    ).toEqual([]);
  });

  it("deduplicates the same raid ID posted in multiple follow-up messages", () => {
    const messages = [
      message({
        channelId,
        content: "https://softres.it/raid/abc123",
        timestamp: "2026-08-14T22:00:00.000Z",
      }),
      message({
        channelId,
        content: "reminder: https://softres.it/raid/abc123",
        timestamp: "2026-08-14T23:00:00.000Z",
      }),
    ];

    expect(findFollowUpSoftResRaidIds(messages, channelId, eventStartMs, new Set())).toEqual([
      "abc123",
    ]);
  });
});
