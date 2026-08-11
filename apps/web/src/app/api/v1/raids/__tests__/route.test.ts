import { afterEach, describe, expect, it, vi } from "vitest";
import { SCOPE } from "~/lib/scopes";

const mockValidateApiToken = vi.fn();
vi.mock("~/server/api/v1-auth", () => ({
  validateApiToken: (...args: unknown[]) => mockValidateApiToken(...args),
}));

const mockNewRaid = {
  raidId: 42,
  name: "Naxx 01/20",
  date: "2026-01-20",
  zone: "Naxxramas",
  attendanceWeight: 1,
};

const mockTransaction = vi.fn(async (cb: (tx: unknown) => unknown) => {
  const tx = {
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([mockNewRaid]),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
  return cb(tx);
});

// Drives generateSignupLinkCandidatesForRaid's first query (the raid lookup) — NOT
// mocked away entirely, so the real runPostRaidCreationSignupLinking implementation
// (with its own internal try/catch) actually runs end-to-end in these tests, rather
// than testing a stand-in that could diverge from production behavior.
let raidSelectShouldThrow = false;
const mockSelect = vi.fn(() => ({
  from: () => ({
    where: () => {
      if (raidSelectShouldThrow) return Promise.reject(new Error("db unavailable"));
      return Promise.resolve([]); // no raid found -> generateSignupLinkCandidatesForRaid short-circuits cleanly
    },
  }),
}));

vi.mock("~/server/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb),
    select: mockSelect,
  },
}));

// Templar contract regression test (TEMPLE-84): POST /api/v1/raids response shape and
// status must be byte-identical regardless of whether post-creation signup-link
// matching succeeds or fails internally — see AGENTS.md "Hard constraint: Templar".
// Uses the real runPostRaidCreationSignupLinking/generateSignupLinkCandidatesForRaid
// implementations (only their DB calls are mocked) so this actually exercises the
// production error-swallowing path, not a mock standing in for it.
describe("POST /api/v1/raids — Templar contract preserved by signup-link matching", () => {
  afterEach(() => {
    vi.clearAllMocks();
    raidSelectShouldThrow = false;
  });

  function makeRequest() {
    return new Request("http://localhost/api/v1/raids", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({
        name: "Naxx 01/20",
        date: "2026-01-20",
        zone: "Naxxramas",
        attendanceWeight: 1,
        raidLogIds: [],
        bench: [],
      }),
    });
  }

  it("returns 201 with the raid when signup-link matching succeeds", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.RAIDLOG_MANAGE] },
    });

    const { POST } = await import("~/app/api/v1/raids/route");
    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(mockNewRaid);
  });

  it("still returns 201 with the same body when signup-link matching's DB query fails", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.RAIDLOG_MANAGE] },
    });
    raidSelectShouldThrow = true;

    const { POST } = await import("~/app/api/v1/raids/route");
    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(mockNewRaid);
  });
});
