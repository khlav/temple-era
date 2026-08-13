import { afterEach, describe, expect, it, vi } from "vitest";
import { SCOPE } from "~/lib/scopes";
import type * as WorldBuffService from "~/server/services/world-buff-service";

const mockValidateApiToken = vi.fn();
vi.mock("~/server/api/v1-auth", () => ({
  validateApiToken: (...args: unknown[]) => mockValidateApiToken(...args),
}));

const mockListActive = vi.fn();
const mockListPast = vi.fn();
const mockCreateAssignment = vi.fn();
const mockGetAssignmentById = vi.fn();

vi.mock("~/server/services/world-buff-service", async () => {
  const actual = await vi.importActual<typeof WorldBuffService>(
    "~/server/services/world-buff-service",
  );
  return {
    ...actual,
    listActiveAssignments: (...args: unknown[]) => mockListActive(...args),
    listPastAssignments: (...args: unknown[]) => mockListPast(...args),
    createAssignment: (...args: unknown[]) => mockCreateAssignment(...args),
    getAssignmentById: (...args: unknown[]) => mockGetAssignmentById(...args),
  };
});

const { WorldBuffServiceError } = await import("~/server/services/world-buff-service");

const VALID_STATUS_ID = "22222222-2222-4222-8222-222222222222";

const mockRow = {
  id: "a1",
  statusId: "s1",
  scheduledAt: new Date("2026-08-18T23:00:00Z"),
  notes: null,
  createdAt: new Date("2026-08-13T00:00:00Z"),
  updatedAt: null,
  status: {
    id: "s1",
    characterName: "Dunckan",
    characterId: null,
    item: "rends_head",
    state: "ready_to_drop",
    queueType: "main",
    notes: null,
    droppedAt: null,
    characterClass: null,
    primaryCharacterName: null,
  },
};

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/v1/world-buffs/assignments${query}`, {
    headers: { authorization: "Bearer test-token" },
  });
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/v1/world-buffs/assignments", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/world-buffs/assignments", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns active assignments for any valid token, no scope required", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });
    mockListActive.mockResolvedValue([mockRow]);

    const { GET } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListActive).toHaveBeenCalledTimes(1);
    expect(body[0].id).toBe("a1");
    expect(body[0].scheduledAt).toBe("2026-08-18T23:00:00.000Z");
  });

  it("403s on ?state=past without worldbuff:manage", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });

    const { GET } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await GET(makeGetRequest("?state=past"));

    expect(response.status).toBe(403);
    expect(mockListPast).not.toHaveBeenCalled();
  });

  it("returns past assignments with worldbuff:manage", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockListPast.mockResolvedValue([mockRow]);

    const { GET } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await GET(makeGetRequest("?state=past"));

    expect(response.status).toBe(200);
    expect(mockListPast).toHaveBeenCalledTimes(1);
  });

  it("400s on an invalid state filter", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });

    const { GET } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await GET(makeGetRequest("?state=bogus"));

    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/world-buffs/assignments", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("403s without worldbuff:manage", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });

    const { POST } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await POST(
      makePostRequest({ statusId: VALID_STATUS_ID, scheduledAt: "2026-08-18T23:00:00.000Z" }),
    );

    expect(response.status).toBe(403);
    expect(mockCreateAssignment).not.toHaveBeenCalled();
  });

  it("400s on an invalid body", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });

    const { POST } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await POST(makePostRequest({ statusId: "not-a-uuid" }));

    expect(response.status).toBe(400);
  });

  it("maps a CONFLICT service error to 409", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockCreateAssignment.mockRejectedValue(
      new WorldBuffServiceError("CONFLICT", "already dropped"),
    );

    const { POST } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await POST(
      makePostRequest({ statusId: VALID_STATUS_ID, scheduledAt: "2026-08-18T23:00:00.000Z" }),
    );

    expect(response.status).toBe(409);
  });

  it("returns 201 with the enriched assignment on success", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockCreateAssignment.mockResolvedValue({ id: "a1" });
    mockGetAssignmentById.mockResolvedValue(mockRow);

    const { POST } = await import("~/app/api/v1/world-buffs/assignments/route");
    const response = await POST(
      makePostRequest({ statusId: VALID_STATUS_ID, scheduledAt: "2026-08-18T23:00:00.000Z" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe("a1");
    expect(mockGetAssignmentById).toHaveBeenCalledWith("a1");
  });
});
