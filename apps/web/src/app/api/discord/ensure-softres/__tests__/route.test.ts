import { afterEach, describe, expect, it, vi } from "vitest";
import { formatEasternDateTime } from "~/lib/raid-formatting";

vi.mock("~/env.js", () => ({ env: { TEMPLE_WEB_API_TOKEN: "test-token" } }));

// A fixed Raid Helper `startTime` (unix seconds) used by every mocked event below, so
// `eventDate` assertions stay correct regardless of DST/timezone specifics.
const TEST_START_TIME = 1789430400;
const TEST_EVENT_DATE = formatEasternDateTime(
  new Date(TEST_START_TIME * 1000),
  "EEE, MMM d 'at' h:mm a 'Server Time'",
);

const mockFetchEventDetail = vi.fn();
vi.mock("~/server/services/raid-helper-client", () => ({
  fetchEventDetail: (...args: unknown[]) => mockFetchEventDetail(...args),
}));

const mockCreateSoftResRaid = vi.fn();
vi.mock("~/server/api/softres-client", () => ({
  createSoftResRaid: (...args: unknown[]) => mockCreateSoftResRaid(...args),
}));

function makeRequest(body: unknown, authorization = "Bearer test-token") {
  return new Request("http://localhost/api/discord/ensure-softres", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discord/ensure-softres", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for a missing or invalid bearer token", async () => {
    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(
      makeRequest({ eventId: "123456789012345678" }, "Bearer wrong-token"),
    );

    expect(response.status).toBe(401);
    expect(mockFetchEventDetail).not.toHaveBeenCalled();
  });

  it("400s on an invalid eventId", async () => {
    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "not-a-snowflake" }));

    expect(response.status).toBe(400);
    expect(mockFetchEventDetail).not.toHaveBeenCalled();
  });

  it("no-ops when softresId is already present", async () => {
    mockFetchEventDetail.mockResolvedValue({
      softresId: "existing-raid-id",
      title: "Thursday Onyxia",
      channelName: "onyxia-signups",
      startTime: TEST_START_TIME,
    });

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      created: false,
      links: [],
      eventTitle: "Thursday Onyxia",
    });
    expect(mockCreateSoftResRaid).not.toHaveBeenCalled();
  });

  it("creates exactly 1 SR for Onyxia", async () => {
    mockFetchEventDetail.mockResolvedValue({
      softresId: undefined,
      title: "Thursday Onyxia",
      channelName: "onyxia-signups",
      startTime: TEST_START_TIME,
    });
    mockCreateSoftResRaid.mockResolvedValue({
      raidId: "abc123",
      adminToken: "tok",
      adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
      publicUrl: "https://softres.it/raid/abc123",
    });

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateSoftResRaid).toHaveBeenCalledTimes(1);
    expect(mockCreateSoftResRaid).toHaveBeenCalledWith(1);
    expect(body).toEqual({
      success: true,
      created: true,
      links: [
        {
          zone: "Onyxia",
          instanceId: 1,
          adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
          publicUrl: "https://softres.it/raid/abc123",
          eventDate: TEST_EVENT_DATE,
        },
      ],
      eventTitle: "Thursday Onyxia",
    });
  });

  it("creates 2 SRs for a non-Onyxia zone / creates one SR per identified zone (doubleheader)", async () => {
    mockFetchEventDetail.mockResolvedValue({
      softresId: undefined,
      title: "Sunday BWL/MC @7PM",
      channelName: "bwl-mc-signups",
      startTime: TEST_START_TIME,
    });
    mockCreateSoftResRaid
      .mockResolvedValueOnce({
        raidId: "bwl1",
        adminToken: "tokA",
        adminUrl: "https://softres.it/raid/bwl1?adminToken=tokA",
        publicUrl: "https://softres.it/raid/bwl1",
      })
      .mockResolvedValueOnce({
        raidId: "mc1",
        adminToken: "tokB",
        adminUrl: "https://softres.it/raid/mc1?adminToken=tokB",
        publicUrl: "https://softres.it/raid/mc1",
      });

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateSoftResRaid).toHaveBeenCalledTimes(2);
    expect(mockCreateSoftResRaid).toHaveBeenNthCalledWith(1, 3); // Blackwing Lair
    expect(mockCreateSoftResRaid).toHaveBeenNthCalledWith(2, 2); // Molten Core
    expect(body.success).toBe(true);
    expect(body.created).toBe(true);
    expect(body.eventTitle).toBe("Sunday BWL/MC @7PM");
    expect(body.links).toEqual([
      {
        zone: "Blackwing Lair",
        instanceId: 3,
        adminUrl: "https://softres.it/raid/bwl1?adminToken=tokA",
        publicUrl: "https://softres.it/raid/bwl1",
        eventDate: TEST_EVENT_DATE,
      },
      {
        zone: "Molten Core",
        instanceId: 2,
        adminUrl: "https://softres.it/raid/mc1?adminToken=tokB",
        publicUrl: "https://softres.it/raid/mc1",
        eventDate: TEST_EVENT_DATE,
      },
    ]);
  });

  it("no-ops with a logged warning when no known zone can be identified", async () => {
    mockFetchEventDetail.mockResolvedValue({
      softresId: undefined,
      title: "Guild Meeting @9PM",
      channelName: "general",
    });

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      created: false,
      links: [],
      eventTitle: "Guild Meeting @9PM",
    });
    expect(mockCreateSoftResRaid).not.toHaveBeenCalled();
  });

  it("returns 500 when the Raid Helper event fetch fails", async () => {
    mockFetchEventDetail.mockRejectedValue(new Error("Raid Helper event fetch failed: 500"));

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));

    expect(response.status).toBe(500);
    expect(mockCreateSoftResRaid).not.toHaveBeenCalled();
  });

  it("returns success with no links when SoftRes raid creation fails for the only zone", async () => {
    mockFetchEventDetail.mockResolvedValue({
      softresId: undefined,
      title: "Thursday Onyxia",
      channelName: "onyxia-signups",
      startTime: TEST_START_TIME,
    });
    mockCreateSoftResRaid.mockRejectedValue(new Error("Failed to establish a SoftRes session"));

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      created: false,
      links: [],
      eventTitle: "Thursday Onyxia",
    });
  });

  it("preserves an already-created link when a later zone fails in a doubleheader", async () => {
    mockFetchEventDetail.mockResolvedValue({
      softresId: undefined,
      title: "Sunday BWL/MC @7PM",
      channelName: "bwl-mc-signups",
      startTime: TEST_START_TIME,
    });
    mockCreateSoftResRaid
      .mockResolvedValueOnce({
        raidId: "bwl1",
        adminToken: "tokA",
        adminUrl: "https://softres.it/raid/bwl1?adminToken=tokA",
        publicUrl: "https://softres.it/raid/bwl1",
      })
      .mockRejectedValueOnce(new Error("Failed to establish a SoftRes session"));

    const { POST } = await import("~/app/api/discord/ensure-softres/route");
    const response = await POST(makeRequest({ eventId: "123456789012345678" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.created).toBe(true);
    expect(body.links).toEqual([
      {
        zone: "Blackwing Lair",
        instanceId: 3,
        adminUrl: "https://softres.it/raid/bwl1?adminToken=tokA",
        publicUrl: "https://softres.it/raid/bwl1",
        eventDate: TEST_EVENT_DATE,
      },
    ]);
  });
});
