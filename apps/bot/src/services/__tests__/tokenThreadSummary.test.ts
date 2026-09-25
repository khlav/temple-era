import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "discord.js";
import { isRaidInWeeklyBlock, postWeeklyTokenEntries } from "../tokenThreadSummary.js";

const { THREAD_ID } = vi.hoisted(() => ({ THREAD_ID: "111111111111111111" }));

vi.mock("../../config/env.js", () => ({
  config: { discordSoftresTokenThreadId: THREAD_ID },
}));

vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const BOT_USER_ID = "bot-user-id";

// Tuesday 9/15/2026 7:00pm ET, 7:30pm ET; Wednesday 9/16/2026 6:30pm ET; Thursday 9/17/2026
// 7:00pm ET — all within the lockout week keyed "2026-09-15".
const TUE_7PM = 1789513200;
const TUE_730PM = 1789515000;
const WED_630PM = 1789597800;
const THU_7PM = 1789686000;

interface FakeMessage {
  id: string;
  author: { id: string };
  embeds: Array<{ description?: string; footer?: { text: string } }>;
  edit: ReturnType<typeof vi.fn>;
}

function fakeMessage(
  overrides: Partial<FakeMessage> & { footer?: string; description?: string },
): FakeMessage {
  return {
    id: overrides.id ?? "existing-message",
    author: overrides.author ?? { id: BOT_USER_ID },
    embeds: overrides.embeds ?? [
      {
        description: overrides.description ?? "",
        footer: overrides.footer ? { text: overrides.footer } : undefined,
      },
    ],
    edit: overrides.edit ?? vi.fn().mockResolvedValue(undefined),
  };
}

function fakeClient(overrides: {
  existingMessages?: FakeMessage[];
  send?: ReturnType<typeof vi.fn>;
  isSendable?: boolean;
  isTextBased?: boolean;
}): Client {
  const send = overrides.send ?? vi.fn().mockResolvedValue(undefined);
  const messages = overrides.existingMessages ?? [];
  // Discord.js's real `messages.fetch()` resolves to a Collection (extends Map, but also
  // exposes array-like helpers like `.find()`), which plain Map/array literals don't — this
  // stand-in only needs the one method tokenThreadSummary.ts actually calls.
  const fakeCollection = {
    find: (predicate: (m: FakeMessage) => boolean) => messages.find(predicate),
  };
  return {
    user: { id: BOT_USER_ID },
    channels: {
      fetch: vi.fn().mockResolvedValue({
        isSendable: () => overrides.isSendable ?? true,
        isTextBased: () => overrides.isTextBased ?? true,
        send,
        messages: { fetch: vi.fn().mockResolvedValue(fakeCollection) },
      }),
    },
  } as unknown as Client;
}

describe("postWeeklyTokenEntries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z")); // within the 2026-09-15 lockout week
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing for an empty entry list", async () => {
    const send = vi.fn();
    const client = fakeClient({ send });
    await postWeeklyTokenEntries(client, []);
    expect(send).not.toHaveBeenCalled();
  });

  it("groups entries by day, in chronological order, with short flat/half-hour times", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [], send });

    await postWeeklyTokenEntries(client, [
      // Deliberately out of order, and mixing two different days.
      {
        zone: "Zul'Gurub",
        url: "https://softres.it/raid/wed1?adminToken=tokW",
        timestampSec: WED_630PM,
      },
      {
        zone: "Blackwing Lair",
        url: "https://softres.it/raid/tue1?adminToken=tokA",
        emoji: "<:bwl_nefarian:1>",
        timestampSec: TUE_730PM,
      },
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/tue2?adminToken=tokB",
        emoji: "<:mc_ragnaros:2>",
        timestampSec: TUE_7PM,
      },
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    const embed = send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      [
        "- **Tuesday 9/15**",
        "  - <:mc_ragnaros:2> MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=" +
          TUE_7PM +
          ")",
        "  - <:bwl_nefarian:1> BWL @ 7:30pm — [tue1 | admintoken: tokA](https://softres.it/raid/tue1?adminToken=tokA#ts=" +
          TUE_730PM +
          ")",
        "- **Wednesday 9/16**",
        "  - ZG @ 6:30pm — [wed1 | admintoken: tokW](https://softres.it/raid/wed1?adminToken=tokW#ts=" +
          WED_630PM +
          ")",
      ].join("\n"),
    );
    expect(embed.data.footer.text).toBe("lockout-week:2026-09-15");
  });

  it("falls back to a plain link label when the admin URL doesn't match the expected shape", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [], send });

    await postWeeklyTokenEntries(client, [
      { zone: "Onyxia", url: "https://softres.it/weird-shape", timestampSec: TUE_7PM },
    ]);

    const embed = send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      `- **Tuesday 9/15**\n  - Ony @ 7pm — [link](https://softres.it/weird-shape#ts=${TUE_7PM})`,
    );
  });

  it("edits the existing message for this week, merging and re-grouping by day", async () => {
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-15",
      description: `- **Tuesday 9/15**\n  - MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
    });
    const send = vi.fn();
    const client = fakeClient({ existingMessages: [existing], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/thu1?adminToken=tokN",
        timestampSec: THU_7PM,
      },
    ]);

    expect(send).not.toHaveBeenCalled();
    expect(existing.edit).toHaveBeenCalledTimes(1);
    const embed = existing.edit.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      [
        "- **Tuesday 9/15**",
        `  - MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
        "- **Thursday 9/17**",
        `  - Naxx @ 7pm — [thu1 | admintoken: tokN](https://softres.it/raid/thu1?adminToken=tokN#ts=${THU_7PM})`,
      ].join("\n"),
    );
  });

  it("keeps the raidId and admin token intact when they contain non-alphanumeric characters", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Onyxia",
        url: "https://softres.it/raid/abc-123?adminToken=tok_45.6",
        timestampSec: TUE_7PM,
      },
    ]);

    const embed = send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      `- **Tuesday 9/15**\n  - Ony @ 7pm — [abc-123 | admintoken: tok_45.6](https://softres.it/raid/abc-123?adminToken=tok_45.6#ts=${TUE_7PM})`,
    );
  });

  it("recovers a multi-word zone's short name from a legacy entry with no emoji", async () => {
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-15",
      description: `<t:${TUE_7PM}:f> Molten Core: https://softres.it/raid/tue2?adminToken=tokB`,
    });
    const client = fakeClient({ existingMessages: [existing] });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Onyxia",
        url: "https://softres.it/raid/wed1?adminToken=tokO",
        timestampSec: WED_630PM,
      },
    ]);

    const embed = existing.edit.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toContain(
      `  - MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
    );
  });

  it("recovers entries from a legacy flat-format message and re-renders them grouped", async () => {
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-15",
      description: `<t:${TUE_7PM}:f> <:mc_ragnaros:2> Molten Core: https://softres.it/raid/tue2?adminToken=tokB`,
    });
    const client = fakeClient({ existingMessages: [existing] });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Onyxia",
        url: "https://softres.it/raid/wed1?adminToken=tokO",
        timestampSec: WED_630PM,
      },
    ]);

    const embed = existing.edit.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toBe(
      [
        "- **Tuesday 9/15**",
        `  - <:mc_ragnaros:2> MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
        "- **Wednesday 9/16**",
        `  - Ony @ 6:30pm — [wed1 | admintoken: tokO](https://softres.it/raid/wed1?adminToken=tokO#ts=${WED_630PM})`,
      ].join("\n"),
    );
  });

  it("starts a new message rather than editing a prior week's summary", async () => {
    const staleWeek = fakeMessage({
      footer: "lockout-week:2026-09-08",
      description: `- **Tuesday 9/8**\n  - Ony @ 7pm — [x | admintoken: y](https://softres.it/raid/x?adminToken=y#ts=1000)`,
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [staleWeek], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Onyxia",
        url: "https://softres.it/raid/tue2?adminToken=tokO",
        timestampSec: TUE_7PM,
      },
    ]);

    expect(staleWeek.edit).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores messages from other authors even if they carry a matching-looking footer", async () => {
    const humanMessage = fakeMessage({
      author: { id: "some-human" },
      footer: "lockout-week:2026-09-15",
      description: "should not be reused",
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [humanMessage], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/thu1?adminToken=tokN",
        timestampSec: THU_7PM,
      },
    ]);

    expect(humanMessage.edit).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uses the raid's own lockout week, not 'now', when the SR is created well before that week starts", async () => {
    // "Now" is 2026-09-08 (the prior lockout week) — e.g. an officer creates the SR days ahead
    // of a raid scheduled for TUE_7PM, which falls in the 2026-09-15 week.
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    const send = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ existingMessages: [], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Molten Core",
        url: "https://softres.it/raid/tue2?adminToken=tokB",
        timestampSec: TUE_7PM,
      },
    ]);

    const embed = send.mock.calls[0]![0].embeds[0];
    expect(embed.data.footer.text).toBe("lockout-week:2026-09-15");
    expect(embed.data.title).toBe("SR Admin Tokens — Week of Sep 15");
  });

  it("finds and merges into the raid's own week's existing summary even when 'now' is a different week", async () => {
    // "Now" is 2026-09-22 — the following lockout week (2026-09-15's week runs through
    // Monday 9/21) — e.g. a late manual /sr for a raid earlier in the 2026-09-15 week, after
    // the new week has already started.
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-15",
      description: `- **Tuesday 9/15**\n  - MC @ 7pm — [tue2 | admintoken: tokB](https://softres.it/raid/tue2?adminToken=tokB#ts=${TUE_7PM})`,
    });
    const send = vi.fn();
    const client = fakeClient({ existingMessages: [existing], send });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/thu1?adminToken=tokN",
        timestampSec: THU_7PM,
      },
    ]);

    expect(send).not.toHaveBeenCalled();
    expect(existing.edit).toHaveBeenCalledTimes(1);
  });

  it("logs and does not throw when the thread is not sendable", async () => {
    const send = vi.fn();
    const client = fakeClient({ send, isSendable: false });

    await expect(
      postWeeklyTokenEntries(client, [
        {
          zone: "Molten Core",
          url: "https://softres.it/raid/mc?adminToken=abc",
          timestampSec: TUE_7PM,
        },
      ]),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("postWeeklyTokenEntries — one line per raid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces an existing line for the same raid id instead of duplicating it", async () => {
    const edit = vi.fn().mockResolvedValue(undefined);
    const existing = fakeMessage({
      footer: "lockout-week:2026-09-15",
      description: `- **Tuesday 9/15**\n  - Naxx @ 7pm — [same1 | admintoken: old](https://softres.it/raid/same1?adminToken=old#ts=${TUE_7PM})`,
      edit,
    });
    const client = fakeClient({ existingMessages: [existing] });

    await postWeeklyTokenEntries(client, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/same1?adminToken=new",
        timestampSec: TUE_730PM,
      },
    ]);

    const description = edit.mock.calls[0]![0].embeds[0].data.description as string;
    expect(description.match(/same1 \|/g)).toHaveLength(1);
    expect(description).toContain("Naxx @ 7:30pm");
    expect(description).toContain("admintoken: new");
  });
});

describe("isRaidInWeeklyBlock", () => {
  it("is true only for a raid id already listed in that week's block", async () => {
    const client = fakeClient({
      existingMessages: [
        fakeMessage({
          footer: "lockout-week:2026-09-15",
          description: `- **Tuesday 9/15**\n  - MC @ 7pm — [abc123 | admintoken: tok](https://softres.it/raid/abc123?adminToken=tok#ts=${TUE_7PM})`,
        }),
      ],
    });
    expect(await isRaidInWeeklyBlock(client, "abc123", TUE_7PM)).toBe(true);
    expect(await isRaidInWeeklyBlock(client, "other", TUE_7PM)).toBe(false);
  });

  it("is false when the week has no block yet, or the thread cannot be read", async () => {
    const empty = fakeClient({ existingMessages: [] });
    const unsendable = fakeClient({ isSendable: false });
    expect(await isRaidInWeeklyBlock(empty, "abc123", TUE_7PM)).toBe(false);
    expect(await isRaidInWeeklyBlock(unsendable, "abc123", TUE_7PM)).toBe(false);
  });
});
