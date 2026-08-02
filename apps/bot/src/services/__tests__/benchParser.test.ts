import { type ThreadChannel } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import {
  containsBenchKeyword,
  extractRaidIdFromThread,
  parseCharacterNames,
} from "../benchParser.js";

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("containsBenchKeyword", () => {
  it.each([
    ["the bare keyword", "bench"],
    ["the keyword followed by names", "bench Alice Bob"],
    ["a colon after the keyword", "bench: Alice"],
    ["a comma after the keyword", "bench, Alice"],
    ["leading and trailing whitespace", "  bench Alice  "],
    ["uppercase", "BENCH Alice"],
    ["mixed case", "BeNcH Alice"],
  ])("accepts %s", (_label, input) => {
    expect(containsBenchKeyword(input)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["a word merely starting with bench", "benched Alice"],
    ["the keyword mid-sentence", "please bench Alice"],
    ["an unrelated message", "who is playing tonight?"],
  ])("rejects %s", (_label, input) => {
    expect(containsBenchKeyword(input)).toBe(false);
  });

  it("rejects a word that only shares the bench prefix", () => {
    // Guard path: the length===5 branch exists so the bare keyword passes without a
    // trailing separator. "benchwarmer" must not slip through it.
    expect(containsBenchKeyword("benchwarmer")).toBe(false);
  });
});

describe("parseCharacterNames", () => {
  it("splits names separated by spaces", () => {
    expect(parseCharacterNames("bench Alice Bob")).toEqual(["Alice", "Bob"]);
  });

  it.each([
    ["commas", "bench Alice,Bob,Carol"],
    ["commas with spaces", "bench Alice, Bob, Carol"],
    ["newlines", "bench Alice\nBob\nCarol"],
    ["mixed separators", "bench Alice, Bob\nCarol"],
  ])("splits names separated by %s", (_label, input) => {
    expect(parseCharacterNames(input)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("takes everything after a bench: prefix", () => {
    expect(parseCharacterNames("bench: Alice, Bob")).toEqual(["Alice", "Bob"]);
  });

  it("matches the bench: prefix case-insensitively", () => {
    expect(parseCharacterNames("Bench: Alice")).toEqual(["Alice"]);
  });

  it("strips surrounding punctuation from names", () => {
    expect(parseCharacterNames("bench Alice. Bob! Carol?")).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("removes only the first bench keyword", () => {
    // Deliberate behaviour per the implementation comment: a raider actually named "Bench"
    // can still be benched, as long as the keyword appears first.
    expect(parseCharacterNames("bench Alice bench")).toEqual(["Alice", "bench"]);
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   \n  "],
    ["the keyword alone", "bench"],
    ["the keyword with no names after the colon", "bench:"],
    ["punctuation only", "bench ..."],
  ])("returns an empty array for %s", (_label, input) => {
    expect(parseCharacterNames(input)).toEqual([]);
  });
});

/**
 * Minimal stand-in for a ThreadChannel: extractRaidIdFromThread only touches
 * thread.messages.fetch, so faking the whole Discord.js object is unnecessary.
 */
function fakeThread(contents: string[]): ThreadChannel {
  const messages = new Map(contents.map((content, i) => [String(i), { content }]));
  return {
    messages: { fetch: vi.fn().mockResolvedValue(messages) },
  } as unknown as ThreadChannel;
}

function throwingThread(error: unknown): ThreadChannel {
  return {
    messages: { fetch: vi.fn().mockRejectedValue(error) },
  } as unknown as ThreadChannel;
}

describe("extractRaidIdFromThread", () => {
  it("extracts the raid ID from a raid URL", async () => {
    const thread = fakeThread(["Raid created: https://www.temple-era.com/raids/123"]);
    await expect(extractRaidIdFromThread(thread)).resolves.toBe(123);
  });

  it("returns a number rather than a string", async () => {
    const thread = fakeThread(["/raids/42"]);
    await expect(extractRaidIdFromThread(thread)).resolves.toBe(42);
  });

  it("finds the URL when it is not in the first message", async () => {
    const thread = fakeThread(["gg everyone", "nice logs", "https://www.temple-era.com/raids/7"]);
    await expect(extractRaidIdFromThread(thread)).resolves.toBe(7);
  });

  it("returns the first raid ID when several messages contain one", async () => {
    const thread = fakeThread(["/raids/10", "/raids/20"]);
    await expect(extractRaidIdFromThread(thread)).resolves.toBe(10);
  });

  it("fetches a bounded number of messages without caching them", async () => {
    // The bot runs with Discord.js caches disabled to keep memory flat; a cached fetch here
    // would quietly reintroduce unbounded message retention.
    const thread = fakeThread(["/raids/1"]);
    await extractRaidIdFromThread(thread);
    expect(thread.messages.fetch).toHaveBeenCalledWith({ limit: 20, cache: false });
  });

  it.each([
    ["no messages at all", []],
    ["no raid URLs", ["gg", "who is benched?"]],
    ["a raid path with no ID", ["https://www.temple-era.com/raids/"]],
    ["a non-numeric raid ID", ["https://www.temple-era.com/raids/abc"]],
  ])("returns null for a thread with %s", async (_label, contents) => {
    await expect(extractRaidIdFromThread(fakeThread(contents))).resolves.toBeNull();
  });

  it("returns null instead of throwing when the fetch fails", async () => {
    // Guard path. A Discord outage or a deleted thread must not take the bot down — this
    // branch never runs in normal operation, which is exactly why it needs a test.
    await expect(
      extractRaidIdFromThread(throwingThread(new Error("Unknown Channel"))),
    ).resolves.toBeNull();
  });

  it("returns null when the fetch rejects with a non-Error value", async () => {
    await expect(extractRaidIdFromThread(throwingThread("rate limited"))).resolves.toBeNull();
  });
});
