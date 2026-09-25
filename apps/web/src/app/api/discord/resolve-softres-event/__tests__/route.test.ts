import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env.js", () => ({ env: { TEMPLE_WEB_API_TOKEN: "test-token" } }));

// 2026-09-25 12:00Z = Fri 8am ET.
const TEST_NOW = new Date("2026-09-25T12:00:00Z");
const nowSec = Math.floor(TEST_NOW.getTime() / 1000);
const HOUR = 3600;
const DAY = 24 * HOUR;

const mockFetchSoftResRaidData = vi.fn();
vi.mock("~/server/api/softres-client", () => ({
  fetchSoftResRaidData: (...args: unknown[]) => mockFetchSoftResRaidData(...args),
}));

const mockFetchScheduledEvents = vi.fn();
const mockFetchEventDetail = vi.fn();
vi.mock("~/server/services/raid-helper-client", () => ({
  fetchScheduledEvents: (...args: unknown[]) => mockFetchScheduledEvents(...args),
  fetchEventDetail: (...args: unknown[]) => mockFetchEventDetail(...args),
}));

function makeRequest(body: unknown, authorization = "Bearer test-token") {
  return new Request("http://localhost/api/discord/resolve-softres-event", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Tue 9/29 7pm ET = 2026-09-29T23:00:00Z
const NAXX_TUE = Date.parse("2026-09-29T23:00:00Z") / 1000;
// Thu 10/1 7pm ET
const MC_THU = Date.parse("2026-10-01T23:00:00Z") / 1000;

function stubEvents(events: Record<string, { startTime: number; title: string }>) {
  mockFetchScheduledEvents.mockResolvedValue(
    Object.entries(events).map(([id, e]) => ({
      id,
      startTime: e.startTime,
      endTime: e.startTime + 3 * HOUR,
      channelId: "c1",
    })),
  );
  mockFetchEventDetail.mockImplementation(async (id: string) => ({
    id,
    startTime: events[id]!.startTime,
    title: events[id]!.title,
    channelName: "tues-naxx",
  }));
}

describe("POST /api/discord/resolve-softres-event", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
    mockFetchSoftResRaidData.mockResolvedValue({ raidId: "QeZ61kge", instance: "naxxramas" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns 401 for a missing or invalid bearer token", async () => {
    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const response = await POST(makeRequest({ raidId: "QeZ61kge" }, "Bearer wrong"));

    expect(response.status).toBe(401);
    expect(mockFetchSoftResRaidData).not.toHaveBeenCalled();
  });

  it("400s on a malformed raid id", async () => {
    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const response = await POST(makeRequest({ raidId: "../etc" }));

    expect(response.status).toBe(400);
  });

  it("returns the zone and the upcoming events that name it", async () => {
    stubEvents({
      "111": { startTime: MC_THU, title: "Thursday MC @7PM" },
      "222": { startTime: NAXX_TUE, title: "Naxx Tue @7PM" },
    });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const body = await (await POST(makeRequest({ raidId: "QeZ61kge" }))).json();

    expect(body).toEqual({
      success: true,
      zone: "Naxxramas",
      candidates: [
        { eventId: "222", title: "Naxx Tue @7PM", source: "raid-helper", timestamp: NAXX_TUE },
      ],
    });
  });

  it("uses SoftRes's own raid date when it has one, without searching Raid Helper", async () => {
    mockFetchSoftResRaidData.mockResolvedValue({
      raidId: "QeZ61kge",
      instance: "naxxramas",
      raidTimestamp: NAXX_TUE + HOUR,
    });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const body = await (await POST(makeRequest({ raidId: "QeZ61kge" }))).json();

    expect(body).toEqual({
      success: true,
      zone: "Naxxramas",
      candidates: [
        { eventId: null, title: "Naxxramas", source: "softres", timestamp: NAXX_TUE + HOUR },
      ],
    });
    expect(mockFetchScheduledEvents).not.toHaveBeenCalled();
  });

  it("matches a Raid Helper event whose title template was never rendered", async () => {
    // Real title seen on a live Naxx event: the {eventtime#…} placeholder is left in place.
    stubEvents({ "555": { startTime: NAXX_TUE, title: "Naxx {eventtime#E MM/dd}" } });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const body = await (await POST(makeRequest({ raidId: "QeZ61kge" }))).json();

    expect(body.candidates.map((c: { eventId: string }) => c.eventId)).toEqual(["555"]);
  });

  it("narrows to the hinted Eastern day", async () => {
    stubEvents({
      "222": { startTime: NAXX_TUE, title: "Naxx Tue @7PM" },
      "333": { startTime: NAXX_TUE + 7 * DAY, title: "Naxx Tue @7PM" },
    });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    // Hints are Eastern days: 9/29 matches the 7pm ET event, 9/30 matches nothing.
    const hit = await (
      await POST(makeRequest({ raidId: "QeZ61kge", dateHint: "2026-09-29" }))
    ).json();
    expect(hit.candidates.map((c: { eventId: string }) => c.eventId)).toEqual(["222"]);

    const miss = await (
      await POST(makeRequest({ raidId: "QeZ61kge", dateHint: "2026-09-30" }))
    ).json();
    expect(miss.candidates).toEqual([]);
  });

  it("ignores events outside the look-ahead window", async () => {
    stubEvents({ "444": { startTime: nowSec + 30 * DAY, title: "Naxx Tue @7PM" } });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const body = await (await POST(makeRequest({ raidId: "QeZ61kge" }))).json();

    expect(body.candidates).toEqual([]);
    expect(mockFetchEventDetail).not.toHaveBeenCalled();
  });

  it("skips an event whose detail fetch fails instead of failing the lookup", async () => {
    stubEvents({ "222": { startTime: NAXX_TUE, title: "Naxx Tue @7PM" } });
    mockFetchScheduledEvents.mockResolvedValue([
      { id: "bad", startTime: NAXX_TUE - HOUR, endTime: NAXX_TUE, channelId: "c1" },
      { id: "222", startTime: NAXX_TUE, endTime: NAXX_TUE + 3 * HOUR, channelId: "c1" },
    ]);
    const detail = mockFetchEventDetail.getMockImplementation()!;
    mockFetchEventDetail.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("boom");
      return detail(id);
    });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const body = await (await POST(makeRequest({ raidId: "QeZ61kge" }))).json();

    expect(body.candidates.map((c: { eventId: string }) => c.eventId)).toEqual(["222"]);
  });

  it("returns a null zone and no candidates for an instance that is not a known raid zone", async () => {
    mockFetchSoftResRaidData.mockResolvedValue({ raidId: "x", instance: "some-dungeon" });

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const body = await (await POST(makeRequest({ raidId: "QeZ61kge" }))).json();

    expect(body).toEqual({ success: true, zone: null, candidates: [] });
    expect(mockFetchScheduledEvents).not.toHaveBeenCalled();
  });

  it("reports a failure (not a 500) when SoftRes cannot read the raid", async () => {
    mockFetchSoftResRaidData.mockRejectedValue(new Error("not found"));

    const { POST } = await import("~/app/api/discord/resolve-softres-event/route");
    const response = await POST(makeRequest({ raidId: "QeZ61kge" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: false,
      error: "Could not read that SoftRes raid",
    });
  });
});
