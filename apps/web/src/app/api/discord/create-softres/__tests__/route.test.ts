import { afterEach, describe, expect, it, vi } from "vitest";
import { formatEasternDateTime } from "~/lib/raid-formatting";

vi.mock("~/env.js", () => ({ env: { TEMPLE_WEB_API_TOKEN: "test-token" } }));

const TEST_CREATED_DATE = formatEasternDateTime(new Date(), "EEE, MMM d 'at' h:mm a 'Server Time'");

const mockCreateSoftResRaid = vi.fn();
vi.mock("~/server/api/softres-client", () => ({
  createSoftResRaid: (...args: unknown[]) => mockCreateSoftResRaid(...args),
}));

function makeRequest(body: unknown, authorization = "Bearer test-token") {
  return new Request("http://localhost/api/discord/create-softres", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discord/create-softres", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for a missing or invalid bearer token", async () => {
    const { POST } = await import("~/app/api/discord/create-softres/route");
    const response = await POST(makeRequest({ zone: "mc" }, "Bearer wrong-token"));

    expect(response.status).toBe(401);
    expect(mockCreateSoftResRaid).not.toHaveBeenCalled();
  });

  it("400s on an unknown zone slug", async () => {
    const { POST } = await import("~/app/api/discord/create-softres/route");
    const response = await POST(makeRequest({ zone: "not-a-real-zone" }));

    expect(response.status).toBe(400);
    expect(mockCreateSoftResRaid).not.toHaveBeenCalled();
  });

  it.each([
    ["onyxia", 1, "Onyxia"],
    ["mc", 2, "Molten Core"],
    ["bwl", 3, "Blackwing Lair"],
    ["zg", 4, "Zul'Gurub"],
    ["aq20", 5, "Ruins of Ahn'Qiraj"],
    ["aq40", 6, "Temple of Ahn'Qiraj"],
    ["naxxramas", 7, "Naxxramas"],
  ])("creates an SR for the requested zone (%s)", async (slug, instanceId, zoneName) => {
    mockCreateSoftResRaid.mockResolvedValue({
      raidId: "abc123",
      adminToken: "tok",
      adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
      publicUrl: "https://softres.it/raid/abc123",
    });

    const { POST } = await import("~/app/api/discord/create-softres/route");
    const response = await POST(makeRequest({ zone: slug }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateSoftResRaid).toHaveBeenCalledTimes(1);
    expect(mockCreateSoftResRaid).toHaveBeenCalledWith(instanceId);
    expect(body).toEqual({
      success: true,
      zone: zoneName,
      adminUrl: "https://softres.it/raid/abc123?adminToken=tok",
      publicUrl: "https://softres.it/raid/abc123",
      createdDate: TEST_CREATED_DATE,
    });
  });

  it("returns 500 when SoftRes raid creation fails", async () => {
    mockCreateSoftResRaid.mockRejectedValue(new Error("Failed to establish a SoftRes session"));

    const { POST } = await import("~/app/api/discord/create-softres/route");
    const response = await POST(makeRequest({ zone: "mc" }));

    expect(response.status).toBe(500);
  });
});
