import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonInteraction, Message } from "discord.js";
import {
  extractAdminLinks,
  handleTokenPromptInteraction,
  handleTokenThreadMessage,
  isTokenPromptCustomId,
  parseDateHint,
} from "../tokenThreadPrompt.js";

const { THREAD_ID } = vi.hoisted(() => ({ THREAD_ID: "111111111111111111" }));

vi.mock("../../config/env.js", () => ({
  config: {
    discordSoftresTokenThreadId: THREAD_ID,
    apiBaseUrl: "https://web.test",
    templeWebApiToken: "web-token",
  },
}));
vi.mock("../../config/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockCheckUserPermissions = vi.fn();
vi.mock("../permissionChecker.js", () => ({
  checkUserPermissions: (...args: unknown[]) => mockCheckUserPermissions(...args),
}));

const mockIsRaidInWeeklyBlock = vi.fn();
const mockPostWeeklyTokenEntries = vi.fn();
vi.mock("../tokenThreadSummary.js", () => ({
  formatRaidWhen: (ts: number) => `when(${ts})`,
  isRaidInWeeklyBlock: (...args: unknown[]) => mockIsRaidInWeeklyBlock(...args),
  postWeeklyTokenEntries: (...args: unknown[]) => mockPostWeeklyTokenEntries(...args),
}));
vi.mock("../zoneEmoji.js", () => ({ getZoneEmoji: () => "<:naxx:1>" }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const NAXX_TS = 1790637600;

function resolveResponse(body: unknown) {
  return { status: 200, json: async () => body };
}

let nextId = 1000;
function makeMessage(content: string, overrides: Record<string, unknown> = {}) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const message = {
    id: String(nextId++),
    content,
    channelId: THREAD_ID,
    author: { id: "poster", bot: false },
    client: {},
    reply,
    ...overrides,
  };
  return { message: message as unknown as Message, reply };
}

describe("extractAdminLinks", () => {
  it("returns each admin link once and ignores public links", () => {
    const links = extractAdminLinks(
      "Naxx https://softres.it/raid/QeZ61kge?adminToken=30d784 and again " +
        "https://softres.it/raid/QeZ61kge?adminToken=30d784, public https://softres.it/raid/zzzz " +
        "[Softres.it](https://softres.it/raid/9av27YVa?adminToken=3c55fc)",
    );
    expect(links).toEqual([
      { raidId: "QeZ61kge", adminToken: "30d784" },
      { raidId: "9av27YVa", adminToken: "3c55fc" },
    ]);
  });
});

describe("parseDateHint", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it.each([
    ["Naxx Tue 09/29 https://softres.it/…", "2026-09-29"],
    ["Sunday BWL/MC 09/13/2026", "2026-09-13"],
    ["Friday BWL 9/18/26", "2026-09-18"],
  ])("reads %s", (text, expected) => {
    expect(parseDateHint(text, now)).toBe(expected);
  });

  it("rolls a yearless date well in the past into next year", () => {
    expect(parseDateHint("Onyxia 1/5", new Date("2026-12-20T12:00:00Z"))).toBe("2027-01-05");
  });

  it("returns undefined for no date or an impossible one", () => {
    expect(parseDateHint("just a token: abc", now)).toBeUndefined();
    expect(parseDateHint("Naxx 2/31", now)).toBeUndefined();
    expect(parseDateHint("Naxx 13/40", now)).toBeUndefined();
  });
});

describe("handleTokenThreadMessage", () => {
  beforeEach(() => {
    mockIsRaidInWeeklyBlock.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const link = "https://softres.it/raid/QeZ61kge?adminToken=30d784";

  it("offers a single Add button when exactly one Raid Helper event matches", async () => {
    mockFetch.mockResolvedValue(
      resolveResponse({
        success: true,
        zone: "Naxxramas",
        candidates: [
          { eventId: "e1", title: "Naxx Tue @7PM", source: "raid-helper", timestamp: NAXX_TS },
        ],
      }),
    );
    const { message, reply } = makeMessage(`Naxx Tue 09/29 ${link}`);

    await handleTokenThreadMessage(message);

    expect(JSON.parse(mockFetch.mock.calls[0]![1].body)).toEqual({
      raidId: "QeZ61kge",
      dateHint: expect.stringMatching(/^\d{4}-09-29$/),
    });
    expect(reply).toHaveBeenCalledTimes(1);
    const sent = reply.mock.calls[0]![0];
    expect(sent.content).toContain("Naxxramas");
    const ids = sent.components[0].components.map(
      (c: { data: { custom_id: string } }) => c.data.custom_id,
    );
    expect(ids).toEqual([
      `tokadd:${message.id}:QeZ61kge:naxx:${NAXX_TS}`,
      `tokdismiss:${message.id}`,
    ]);
    // The token must never ride in a custom id.
    expect(JSON.stringify(sent)).not.toContain("30d784");
  });

  it("offers a picker when several events match", async () => {
    mockFetch.mockResolvedValue(
      resolveResponse({
        success: true,
        zone: "Naxxramas",
        candidates: [
          { eventId: "e1", title: "Naxx Tue", source: "raid-helper", timestamp: NAXX_TS },
          { eventId: "e2", title: "Naxx Tue", source: "raid-helper", timestamp: NAXX_TS + 604800 },
        ],
      }),
    );
    const { message, reply } = makeMessage(link);

    await handleTokenThreadMessage(message);

    const sent = reply.mock.calls[0]![0];
    const menu = sent.components[0].components[0].toJSON();
    expect(menu.custom_id).toBe(`tokpick:${message.id}:QeZ61kge:naxx`);
    expect(menu.options.map((o: { value: string }) => o.value)).toEqual([
      String(NAXX_TS),
      String(NAXX_TS + 604800),
    ]);
  });

  it.each([
    ["no matching event", { success: true, zone: "Naxxramas", candidates: [] }],
    ["an unknown zone", { success: true, zone: null, candidates: [] }],
    ["a failed lookup", { success: false, error: "Could not read that SoftRes raid" }],
  ])("stays silent for %s", async (_name, body) => {
    mockFetch.mockResolvedValue(resolveResponse(body));
    const { message, reply } = makeMessage(link);

    await handleTokenThreadMessage(message);

    expect(reply).not.toHaveBeenCalled();
  });

  it("stays silent when the raid is already in that week's block", async () => {
    mockIsRaidInWeeklyBlock.mockResolvedValue(true);
    mockFetch.mockResolvedValue(
      resolveResponse({
        success: true,
        zone: "Naxxramas",
        candidates: [{ eventId: "e1", title: "Naxx", source: "raid-helper", timestamp: NAXX_TS }],
      }),
    );
    const { message, reply } = makeMessage(link);

    await handleTokenThreadMessage(message);

    expect(reply).not.toHaveBeenCalled();
  });

  it("ignores bots, other channels, and messages without an admin link", async () => {
    const bot = makeMessage(link, { author: { id: "b", bot: true } });
    const elsewhere = makeMessage(link, { channelId: "999" });
    const plain = makeMessage("public only https://softres.it/raid/QeZ61kge");

    await handleTokenThreadMessage(bot.message);
    await handleTokenThreadMessage(elsewhere.message);
    await handleTokenThreadMessage(plain.message);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not prompt twice for the same message", async () => {
    mockFetch.mockResolvedValue(
      resolveResponse({
        success: true,
        zone: "Naxxramas",
        candidates: [{ eventId: "e1", title: "Naxx", source: "raid-helper", timestamp: NAXX_TS }],
      }),
    );
    const { message, reply } = makeMessage(link);

    await handleTokenThreadMessage(message);
    await handleTokenThreadMessage(message);

    expect(reply).toHaveBeenCalledTimes(1);
  });
});

describe("handleTokenPromptInteraction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeInteraction(customId: string, opts: { userId?: string; sourceGone?: boolean } = {}) {
    const source = {
      author: { id: "poster" },
      content: "Naxx https://softres.it/raid/QeZ61kge?adminToken=30d784",
    };
    const promptDelete = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      customId,
      user: { id: opts.userId ?? "poster" },
      deferred: true,
      replied: false,
      values: [String(NAXX_TS + 604800)],
      isStringSelectMenu: () => customId.startsWith("tokpick:"),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
      message: { delete: promptDelete },
      client: {
        channels: {
          fetch: vi.fn().mockResolvedValue({
            isTextBased: () => true,
            messages: {
              fetch: opts.sourceGone
                ? vi.fn().mockRejectedValue(new Error("Unknown Message"))
                : vi.fn().mockResolvedValue(source),
            },
          }),
        },
      },
    };
    return {
      interaction: interaction as unknown as ButtonInteraction,
      editReply,
      promptDelete,
    };
  }

  it("adds the entry for the poster, re-reading the token from the original message", async () => {
    const { interaction, editReply, promptDelete } = makeInteraction(
      `tokadd:src1:QeZ61kge:naxx:${NAXX_TS}`,
    );

    await handleTokenPromptInteraction(interaction);

    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledWith(interaction.client, [
      {
        zone: "Naxxramas",
        url: "https://softres.it/raid/QeZ61kge?adminToken=30d784",
        emoji: "<:naxx:1>",
        timestampSec: NAXX_TS,
      },
    ]);
    expect(editReply.mock.calls[0]![0].content).toContain("Added");
    expect(promptDelete).toHaveBeenCalled();
    expect(mockCheckUserPermissions).not.toHaveBeenCalled();
  });

  it("uses the picked raid time from the select menu", async () => {
    const { interaction } = makeInteraction("tokpick:src1:QeZ61kge:naxx");

    await handleTokenPromptInteraction(interaction);

    expect(mockPostWeeklyTokenEntries.mock.calls[0]![1][0].timestampSec).toBe(NAXX_TS + 604800);
  });

  it("lets someone else with SoftRes access add it", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canAccessSoftres: true,
    });
    const { interaction } = makeInteraction(`tokadd:src1:QeZ61kge:naxx:${NAXX_TS}`, {
      userId: "lead",
    });

    await handleTokenPromptInteraction(interaction);

    expect(mockPostWeeklyTokenEntries).toHaveBeenCalledTimes(1);
  });

  it("refuses someone who is neither the poster nor has SoftRes access", async () => {
    mockCheckUserPermissions.mockResolvedValue({
      success: true,
      hasAccount: true,
      canAccessSoftres: false,
    });
    const { interaction, editReply, promptDelete } = makeInteraction(
      `tokadd:src1:QeZ61kge:naxx:${NAXX_TS}`,
      { userId: "rando" },
    );

    await handleTokenPromptInteraction(interaction);

    expect(mockPostWeeklyTokenEntries).not.toHaveBeenCalled();
    expect(editReply.mock.calls[0]![0].content).toContain("Only the person who posted");
    expect(promptDelete).not.toHaveBeenCalled();
  });

  it("dismisses without adding anything", async () => {
    const { interaction, promptDelete } = makeInteraction("tokdismiss:src1");

    await handleTokenPromptInteraction(interaction);

    expect(mockPostWeeklyTokenEntries).not.toHaveBeenCalled();
    expect(promptDelete).toHaveBeenCalled();
  });

  it("tells the user when the original message is gone", async () => {
    const { interaction, editReply } = makeInteraction(`tokadd:src1:QeZ61kge:naxx:${NAXX_TS}`, {
      sourceGone: true,
    });

    await handleTokenPromptInteraction(interaction);

    expect(mockPostWeeklyTokenEntries).not.toHaveBeenCalled();
    expect(editReply.mock.calls[0]![0].content).toContain("original message");
  });
});

describe("isTokenPromptCustomId", () => {
  it("matches only this feature's ids", () => {
    expect(isTokenPromptCustomId("tokadd:1:a:naxx:5")).toBe(true);
    expect(isTokenPromptCustomId("tokpick:1:a:naxx")).toBe(true);
    expect(isTokenPromptCustomId("tokdismiss:1")).toBe(true);
    expect(isTokenPromptCustomId("confirm-1-2")).toBe(false);
  });
});
