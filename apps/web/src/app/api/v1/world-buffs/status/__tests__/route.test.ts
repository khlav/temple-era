import { afterEach, describe, expect, it, vi } from "vitest";
import { SCOPE } from "~/lib/scopes";
import type * as WorldBuffService from "~/server/services/world-buff-service";

const mockValidateApiToken = vi.fn();
vi.mock("~/server/api/v1-auth", () => ({
  validateApiToken: (...args: unknown[]) => mockValidateApiToken(...args),
}));

// vi.importActual below loads the real service module for its non-mocked exports
// (WorldBuffServiceError), which transitively imports `~/server/db` — and that module
// runs real env validation at import time. Stub it out so the import doesn't fail in CI,
// which (unlike local dev) runs `test` without SKIP_ENV_VALIDATION set.
vi.mock("~/server/db", () => ({ db: {} }));

const mockGetMatrix = vi.fn();
const mockSubmitAvailability = vi.fn();

vi.mock("~/server/services/world-buff-service", async () => {
  const actual = await vi.importActual<typeof WorldBuffService>(
    "~/server/services/world-buff-service",
  );
  return {
    ...actual,
    getMatrix: (...args: unknown[]) => mockGetMatrix(...args),
    submitAvailability: (...args: unknown[]) => mockSubmitAvailability(...args),
  };
});

const mockStatusRow = {
  id: "s1",
  characterName: "Dunckan",
  characterId: null,
  item: "rends_head",
  state: "ready_to_drop",
  queueType: "main",
  notes: null,
  droppedAt: null,
  createdAt: new Date("2026-08-13T00:00:00Z"),
  updatedAt: null,
};

function makeGetRequest() {
  return new Request("http://localhost/api/v1/world-buffs/status", {
    headers: { authorization: "Bearer test-token" },
  });
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/v1/world-buffs/status", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/world-buffs/status", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns status rows for any valid token", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });
    mockGetMatrix.mockResolvedValue([mockStatusRow]);

    const { GET } = await import("~/app/api/v1/world-buffs/status/route");
    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0].id).toBe("s1");
  });
});

describe("POST /api/v1/world-buffs/status", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("403s without worldbuff:manage", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });

    const { POST } = await import("~/app/api/v1/world-buffs/status/route");
    const response = await POST(makePostRequest({ characterName: "Dunckan", item: "rends_head" }));

    expect(response.status).toBe(403);
    expect(mockSubmitAvailability).not.toHaveBeenCalled();
  });

  it("400s on an invalid item enum", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });

    const { POST } = await import("~/app/api/v1/world-buffs/status/route");
    const response = await POST(
      makePostRequest({ characterName: "Dunckan", item: "not_a_real_item" }),
    );

    expect(response.status).toBe(400);
  });

  it("400s on a blank character name", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });

    const { POST } = await import("~/app/api/v1/world-buffs/status/route");
    const response = await POST(makePostRequest({ characterName: "", item: "rends_head" }));

    expect(response.status).toBe(400);
  });

  it("returns 200 with the upserted status row on success", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockSubmitAvailability.mockResolvedValue(mockStatusRow);

    const { POST } = await import("~/app/api/v1/world-buffs/status/route");
    const response = await POST(
      makePostRequest({ characterName: "Dunckan", item: "rends_head", queueType: "backup" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.characterName).toBe("Dunckan");
    expect(mockSubmitAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        characterName: "Dunckan",
        item: "rends_head",
        queueType: "backup",
        actingUserId: "u1",
      }),
    );
  });
});
