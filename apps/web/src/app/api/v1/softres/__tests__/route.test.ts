import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCOPE } from "~/lib/scopes";

const SR_CHANNEL = "111111111111111111";
const EVENT_ID = "222222222222222222";
const SECRET = "supersecrettoken";

vi.mock("~/env.js", () => ({
  env: { DISCORD_SERVER_ID: "999999999999999999", DISCORD_RAID_SR_CHANNEL_IDS: [SR_CHANNEL] },
}));

const mockValidate = vi.fn();
vi.mock("~/server/api/v1-auth", () => ({
  validateApiToken: (...args: unknown[]) => mockValidate(...args),
}));

const mockCreate = vi.fn();
vi.mock("~/server/api/softres-client", () => ({
  createSoftResRaid: (...args: unknown[]) => mockCreate(...args),
}));

const mockFetchEventDetail = vi.fn();
vi.mock("~/server/services/raid-helper-client", () => ({
  fetchEventDetail: (...args: unknown[]) => mockFetchEventDetail(...args),
}));

const mockFindEvents = vi.fn();
vi.mock("~/server/services/softres-event-lookup", () => ({
  findEventsForZone: (...args: unknown[]) => mockFindEvents(...args),
}));

const mockThreadUsable = vi.fn();
const mockHasPost = vi.fn();
const mockEmojiMap = vi.fn();
const mockPostEmbed = vi.fn();
const mockUpsert = vi.fn();
vi.mock("~/server/services/softres-discord-service", () => ({
  isTokenThreadUsable: (...a: unknown[]) => mockThreadUsable(...a),
  hasSrPostForEvent: (...a: unknown[]) => mockHasPost(...a),
  getZoneEmojiMap: (...a: unknown[]) => mockEmojiMap(...a),
  postChannelEmbed: (...a: unknown[]) => mockPostEmbed(...a),
  upsertWeeklyTokenBlock: (...a: unknown[]) => mockUpsert(...a),
}));

// Tue 2026-09-29 8pm ET
const NAXX_TS = Date.parse("2026-09-30T00:00:00Z") / 1000;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/softres", {
    method: "POST",
    headers: { authorization: "Bearer tera_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const { POST } = await import("~/app/api/v1/softres/route");
  return POST(makeRequest(body));
}

describe("POST /api/v1/softres", () => {
  beforeEach(() => {
    mockValidate.mockResolvedValue({ user: { id: "u1", scopes: [SCOPE.SOFTRES_ACCESS] } });
    mockThreadUsable.mockResolvedValue(true);
    mockHasPost.mockResolvedValue(false);
    mockEmojiMap.mockResolvedValue(new Map([["Naxxramas", "<:naxx_kelthuzad:5>"]]));
    mockPostEmbed.mockResolvedValue("msg1");
    mockUpsert.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue({
      raidId: "abc123",
      adminToken: SECRET,
      adminUrl: `https://softres.it/raid/abc123?adminToken=${SECRET}`,
      publicUrl: "https://softres.it/raid/abc123",
    });
    mockFetchEventDetail.mockResolvedValue({
      id: EVENT_ID,
      startTime: NAXX_TS,
      title: "Naxx {eventtime#E MM/dd}",
      displayTitle: "Naxx Tue 09/29",
      channelName: "tues-naxx",
      channelId: SR_CHANNEL,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes through the auth failure", async () => {
    const { NextResponse } = await import("next/server");
    mockValidate.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await post({ zone: "naxxramas", channelId: SR_CHANNEL })).status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("403s a user without softres:access, exactly like /sr", async () => {
    mockValidate.mockResolvedValue({ user: { id: "u1", scopes: [SCOPE.RAIDLOG_MANAGE] } });
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL });

    expect(response.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["no channel and no event", { zone: "naxxramas" }],
    ["both an event and a timestamp", { zone: "naxxramas", eventId: EVENT_ID, timestamp: NAXX_TS }],
    ["an event and a date", { zone: "naxxramas", eventId: EVENT_ID, date: "2026-09-29" }],
    ["a malformed date", { zone: "naxxramas", date: "9/29" }],
    ["an unknown zone", { zone: "stormwind", channelId: SR_CHANNEL }],
  ])("400s %s", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses a channel that isn't a SoftRes signup channel", async () => {
    const response = await post({ zone: "naxxramas", channelId: "333333333333333333" });

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses, creating nothing, when the Token thread isn't usable", async () => {
    mockThreadUsable.mockResolvedValue(false);
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL });

    expect(response.status).toBe(503);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates an SR at an explicit time: token block first, then the public post like /sr", async () => {
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL, timestamp: NAXX_TS });
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(7);
    expect(mockUpsert).toHaveBeenCalledWith([
      {
        zone: "Naxxramas",
        url: `https://softres.it/raid/abc123?adminToken=${SECRET}`,
        emoji: "<:naxx_kelthuzad:5>",
        timestampSec: NAXX_TS,
      },
    ]);
    const [channel, embed] = mockPostEmbed.mock.calls[0]!;
    expect(channel).toBe(SR_CHANNEL);
    expect(embed.title).toBe("SRs : Naxxramas");
    expect(embed.url).toBeUndefined();
    expect(embed.description).toContain(
      "<:naxx_kelthuzad:5> Naxxramas: https://softres.it/raid/abc123",
    );
    expect(embed.description).toContain("Tue, Sep 29 at 8:00 PM Server Time");
    expect(mockUpsert.mock.invocationCallOrder[0]!).toBeLessThan(
      mockPostEmbed.mock.invocationCallOrder[0]!,
    );
    expect(body).toMatchObject({
      zone: "Naxxramas",
      publicUrl: "https://softres.it/raid/abc123",
      messageId: "msg1",
    });
    // The admin link must never come back to the caller — it only goes to the Token thread.
    expect(text).not.toContain(SECRET);
    expect(embed.description).not.toContain(SECRET);
  });

  it("takes the raid's time, title, channel and signup link from a Raid Helper event", async () => {
    const response = await post({ zone: "naxxramas", eventId: EVENT_ID });

    expect(response.status).toBe(200);
    expect(mockUpsert.mock.calls[0]![0][0].timestampSec).toBe(NAXX_TS);
    const [channel, embed] = mockPostEmbed.mock.calls[0]!;
    expect(channel).toBe(SR_CHANNEL);
    expect(embed.title).toBe("SRs : Naxx Tue 09/29");
    // The same link the bot's roster-forward matches an SR post on.
    expect(embed.url).toBe(
      `https://discord.com/channels/999999999999999999/${SR_CHANNEL}/${EVENT_ID}`,
    );
  });

  it.each([
    ["the event isn't found", () => mockFetchEventDetail.mockRejectedValue(new Error("404")), 404],
    [
      "the event names a different zone",
      () =>
        mockFetchEventDetail.mockResolvedValue({
          id: EVENT_ID,
          startTime: NAXX_TS,
          title: "Thursday MC @7PM",
          channelName: "thurs-mc",
          channelId: SR_CHANNEL,
        }),
      422,
    ],
    [
      "the event already has a SoftRes attached",
      () =>
        mockFetchEventDetail.mockResolvedValue({
          id: EVENT_ID,
          startTime: NAXX_TS,
          title: "Naxx Tue",
          channelName: "tues-naxx",
          channelId: SR_CHANNEL,
          softresId: "already",
        }),
      409,
    ],
    ["the channel already has an SR post for it", () => mockHasPost.mockResolvedValue(true), 409],
  ])("refuses, creating nothing, when %s", async (_name, arrange, status) => {
    arrange();
    const response = await post({ zone: "naxxramas", eventId: EVENT_ID });

    expect(response.status).toBe(status);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("finds the raid itself from a zone and an Eastern day, so the caller needs no event id", async () => {
    mockFindEvents.mockResolvedValue([{ eventId: EVENT_ID, title: "Naxx Tue 09/29" }]);
    const response = await post({ zone: "naxxramas", date: "2026-09-29" });

    expect(response.status).toBe(200);
    expect(mockFindEvents).toHaveBeenCalledWith("Naxxramas", "2026-09-29");
    expect(mockPostEmbed.mock.calls[0]![1].title).toBe("SRs : Naxx Tue 09/29");
    expect(mockUpsert.mock.calls[0]![0][0].timestampSec).toBe(NAXX_TS);
  });

  it("404s, creating nothing, when no raid names that zone on that day", async () => {
    mockFindEvents.mockResolvedValue([]);
    const response = await post({ zone: "naxxramas", date: "2026-09-29" });

    expect(response.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("asks which one, creating nothing, when several raids match that day", async () => {
    mockFindEvents.mockResolvedValue([
      { eventId: "1", title: "Naxx early", timestamp: NAXX_TS },
      { eventId: "2", title: "Naxx late", timestamp: NAXX_TS + 3600 },
    ]);
    const response = await post({ zone: "naxxramas", date: "2026-09-29" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.candidates.map((c: { eventId: string }) => c.eventId)).toEqual(["1", "2"]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retries the token block once before giving up on it", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("Discord 500")).mockResolvedValueOnce(undefined);
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL });

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("does not announce an SR whose admin token couldn't be saved", async () => {
    mockUpsert.mockRejectedValue(new Error("Discord 500"));
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL });
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(mockPostEmbed).not.toHaveBeenCalled();
    expect(text).not.toContain(SECRET);
  });

  it("reports a failed public post, with the public link but never the admin one", async () => {
    mockPostEmbed.mockRejectedValue(new Error("Discord 403"));
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL });
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(text).publicUrl).toBe("https://softres.it/raid/abc123");
    expect(text).not.toContain(SECRET);
  });

  it("still creates the SR when the zone emoji can't be loaded", async () => {
    mockEmojiMap.mockResolvedValue(new Map());
    const response = await post({ zone: "naxxramas", channelId: SR_CHANNEL });

    expect(response.status).toBe(200);
    expect(mockPostEmbed.mock.calls[0]![1].description).toContain(
      "\nNaxxramas: https://softres.it/raid/abc123",
    );
    expect(mockPostEmbed.mock.calls[0]![1].description).not.toContain("<:");
  });
});
