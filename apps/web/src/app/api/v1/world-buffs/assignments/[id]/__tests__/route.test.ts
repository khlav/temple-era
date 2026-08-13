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

const mockUpdateAssignment = vi.fn();
const mockDeleteAssignment = vi.fn();
const mockGetAssignmentById = vi.fn();

vi.mock("~/server/services/world-buff-service", async () => {
  const actual = await vi.importActual<typeof WorldBuffService>(
    "~/server/services/world-buff-service",
  );
  return {
    ...actual,
    updateAssignment: (...args: unknown[]) => mockUpdateAssignment(...args),
    deleteAssignment: (...args: unknown[]) => mockDeleteAssignment(...args),
    getAssignmentById: (...args: unknown[]) => mockGetAssignmentById(...args),
  };
});

const { WorldBuffServiceError } = await import("~/server/services/world-buff-service");

const VALID_ID = "11111111-1111-4111-8111-111111111111";

const mockRow = {
  id: VALID_ID,
  statusId: "s1",
  scheduledAt: new Date("2026-08-25T23:00:00Z"),
  notes: "rescheduled",
  createdAt: new Date("2026-08-13T00:00:00Z"),
  updatedAt: new Date("2026-08-13T01:00:00Z"),
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

function makePatchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/v1/world-buffs/assignments/${id}`, {
    method: "PATCH",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string) {
  return new Request(`http://localhost/api/v1/world-buffs/assignments/${id}`, {
    method: "DELETE",
    headers: { authorization: "Bearer test-token" },
  });
}

describe("PATCH /api/v1/world-buffs/assignments/[id]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("403s without worldbuff:manage", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });

    const { PATCH } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await PATCH(makePatchRequest(VALID_ID, { notes: "x" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(403);
    expect(mockUpdateAssignment).not.toHaveBeenCalled();
  });

  it("400s on a non-UUID id", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });

    const { PATCH } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await PATCH(makePatchRequest("not-a-uuid", { notes: "x" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
  });

  it("maps a NOT_FOUND service error to 404", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockUpdateAssignment.mockRejectedValue(
      new WorldBuffServiceError("NOT_FOUND", "Assignment not found"),
    );

    const { PATCH } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await PATCH(makePatchRequest(VALID_ID, { notes: "x" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 200 with the enriched assignment on success", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockUpdateAssignment.mockResolvedValue({ id: VALID_ID });
    mockGetAssignmentById.mockResolvedValue(mockRow);

    const { PATCH } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await PATCH(makePatchRequest(VALID_ID, { notes: "rescheduled" }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notes).toBe("rescheduled");
    expect(mockGetAssignmentById).toHaveBeenCalledWith(VALID_ID);
  });
});

describe("DELETE /api/v1/world-buffs/assignments/[id]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("403s without worldbuff:manage", async () => {
    mockValidateApiToken.mockResolvedValue({ user: { id: "u1", scopes: [] } });

    const { DELETE } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await DELETE(makeDeleteRequest(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(403);
    expect(mockDeleteAssignment).not.toHaveBeenCalled();
  });

  it("maps a NOT_FOUND service error to 404", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockDeleteAssignment.mockRejectedValue(
      new WorldBuffServiceError("NOT_FOUND", "Assignment not found"),
    );

    const { DELETE } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await DELETE(makeDeleteRequest(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 200 on success", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.WORLDBUFF_MANAGE] },
    });
    mockDeleteAssignment.mockResolvedValue({ id: VALID_ID });

    const { DELETE } = await import("~/app/api/v1/world-buffs/assignments/[id]/route");
    const response = await DELETE(makeDeleteRequest(VALID_ID), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
