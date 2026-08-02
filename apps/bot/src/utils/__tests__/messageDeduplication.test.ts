import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageDeduplicator } from "../messageDeduplication.js";

const MINUTE = 60 * 1000;
const DEFAULT_TIMEOUT = 5 * MINUTE;
const CLEANUP_INTERVAL = MINUTE;

/**
 * The expiry sweep is the reason this class exists — it is what stops the bot's memory
 * growing for as long as the process runs — but it leaves no public trace. Reading the
 * private map is the only way to tell an entry that was swept from one that is merely
 * reported as absent by `has`.
 */
const entryCount = (deduplicator: MessageDeduplicator): number =>
  (deduplicator as unknown as { processedItems: Map<string, number> }).processedItems.size;

describe("MessageDeduplicator", () => {
  let deduplicator: MessageDeduplicator;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    deduplicator?.destroy();
    vi.useRealTimers();
  });

  describe("basic tracking", () => {
    beforeEach(() => {
      deduplicator = new MessageDeduplicator();
    });

    it("reports an unseen id as not processed", () => {
      expect(deduplicator.has("message-1")).toBe(false);
    });

    it("reports an added id as processed", () => {
      deduplicator.add("message-1");
      expect(deduplicator.has("message-1")).toBe(true);
    });

    it("tracks ids independently", () => {
      deduplicator.add("message-1");
      expect(deduplicator.has("message-2")).toBe(false);
    });

    it("treats adding the same id twice as one entry", () => {
      deduplicator.add("message-1");
      deduplicator.add("message-1");
      expect(entryCount(deduplicator)).toBe(1);
    });

    it("distinguishes ids that differ only by case", () => {
      deduplicator.add("Message-1");
      expect(deduplicator.has("message-1")).toBe(false);
    });

    it("handles an empty-string id", () => {
      deduplicator.add("");
      expect(deduplicator.has("")).toBe(true);
    });
  });

  describe("expiry", () => {
    beforeEach(() => {
      deduplicator = new MessageDeduplicator();
    });

    it("still reports an id as processed just before the timeout", () => {
      deduplicator.add("message-1");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1);
      expect(deduplicator.has("message-1")).toBe(true);
    });

    it("reports an id as unprocessed once the timeout has passed", () => {
      deduplicator.add("message-1");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT + 1);
      expect(deduplicator.has("message-1")).toBe(false);
    });

    it("drops an expired entry when has() reads it, not just hides it", () => {
      deduplicator.add("message-1");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT + 1);
      deduplicator.has("message-1");
      expect(entryCount(deduplicator)).toBe(0);
    });

    it("restarts the timeout when an id is re-added", () => {
      deduplicator.add("message-1");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1);
      deduplicator.add("message-1");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1);
      expect(deduplicator.has("message-1")).toBe(true);
    });

    it("honours a custom timeout", () => {
      deduplicator.destroy();
      deduplicator = new MessageDeduplicator(10 * 1000);
      deduplicator.add("message-1");
      vi.advanceTimersByTime(5 * 1000);
      expect(deduplicator.has("message-1")).toBe(true);
      vi.advanceTimersByTime(6 * 1000);
      expect(deduplicator.has("message-1")).toBe(false);
    });
  });

  describe("background cleanup", () => {
    beforeEach(() => {
      deduplicator = new MessageDeduplicator();
    });

    it("frees expired entries without anyone calling has()", () => {
      deduplicator.add("message-1");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT + CLEANUP_INTERVAL);
      expect(entryCount(deduplicator)).toBe(0);
    });

    it("leaves unexpired entries alone when the sweep runs", () => {
      deduplicator.add("message-1");
      vi.advanceTimersByTime(CLEANUP_INTERVAL + 1);
      expect(entryCount(deduplicator)).toBe(1);
    });

    it("sweeps only the entries that have expired", () => {
      deduplicator.add("old");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT - CLEANUP_INTERVAL);
      deduplicator.add("new");
      vi.advanceTimersByTime(2 * CLEANUP_INTERVAL);

      expect(deduplicator.has("old")).toBe(false);
      expect(deduplicator.has("new")).toBe(true);
    });

    it("keeps sweeping on every interval, not just the first", () => {
      deduplicator.add("first");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT + CLEANUP_INTERVAL);
      expect(entryCount(deduplicator)).toBe(0);

      deduplicator.add("second");
      vi.advanceTimersByTime(DEFAULT_TIMEOUT + CLEANUP_INTERVAL);
      expect(entryCount(deduplicator)).toBe(0);
    });

    it("retains every unexpired entry, with no cap on how many", () => {
      // Documents actual behaviour: bounded by arrival rate over the timeout window, not by
      // a size limit. The class reads like an LRU cache and is not one — this test is what
      // stops that assumption creeping back in.
      for (let i = 0; i < 5000; i++) {
        deduplicator.add(`message-${i}`);
      }
      vi.advanceTimersByTime(CLEANUP_INTERVAL + 1);
      expect(entryCount(deduplicator)).toBe(5000);
    });
  });

  describe("destroy", () => {
    beforeEach(() => {
      deduplicator = new MessageDeduplicator();
    });

    it("forgets everything it was tracking", () => {
      deduplicator.add("message-1");
      deduplicator.destroy();
      expect(deduplicator.has("message-1")).toBe(false);
    });

    it("stops the cleanup interval", () => {
      deduplicator.add("message-1");
      deduplicator.destroy();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("can be called twice without throwing", () => {
      deduplicator.destroy();
      expect(() => deduplicator.destroy()).not.toThrow();
    });

    it("still accepts entries after being destroyed", () => {
      // The handlers hold a module-level instance for the process lifetime, so this only
      // matters if destroy() is ever wired to a shutdown path — but silently dropping
      // writes would be worse than the leaked interval.
      deduplicator.destroy();
      deduplicator.add("message-1");
      expect(deduplicator.has("message-1")).toBe(true);
    });
  });

  it("keeps instances isolated from one another", () => {
    deduplicator = new MessageDeduplicator();
    const other = new MessageDeduplicator();

    deduplicator.add("message-1");

    expect(other.has("message-1")).toBe(false);
    other.destroy();
  });
});
