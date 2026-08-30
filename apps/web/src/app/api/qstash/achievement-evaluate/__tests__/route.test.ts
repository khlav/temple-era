import { afterEach, describe, expect, it, vi } from "vitest";

const mockVerifyQstashRequest = vi.fn();
vi.mock("~/server/services/qstash-verify", () => ({
  verifyQstashRequest: (...args: unknown[]) => mockVerifyQstashRequest(...args),
}));

const mockEvaluateAchievementsForFamilies = vi.fn();
vi.mock("~/server/services/achievement-rules", () => ({
  evaluateAchievementsForFamilies: (...args: unknown[]) =>
    mockEvaluateAchievementsForFamilies(...args),
}));

// Chainable stand-in for db.selectDistinct().from().innerJoin().innerJoin().where() —
// resolves to `rows` regardless of the exact chain shape, following the pattern
// established in achievement-rules.test.ts / achievement.test.ts.
function chainable<T>(rows: T[]) {
  const obj: Record<string, unknown> = {};
  obj.from = () => obj;
  obj.innerJoin = () => obj;
  obj.where = () => Promise.resolve(rows);
  return obj;
}

let selectDistinctRows: Array<{ primaryCharacterId: number }> = [];
const mockSelectDistinct = vi.fn((..._args: unknown[]) => chainable(selectDistinctRows));
vi.mock("~/server/db", () => ({
  db: {
    selectDistinct: (...args: unknown[]) => mockSelectDistinct(...args),
  },
}));

function makeRequest(body?: unknown) {
  return new Request("http://localhost/api/qstash/achievement-evaluate", {
    method: "POST",
    headers: { "upstash-signature": "sig", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/qstash/achievement-evaluate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    selectDistinctRows = [];
  });

  it("rejects a request with an invalid/missing signature — no evaluation attempted", async () => {
    mockVerifyQstashRequest.mockResolvedValue({ valid: false, body: null });

    const { POST } = await import("~/app/api/qstash/achievement-evaluate/route");
    const response = await POST(makeRequest({ raidId: 1, trigger: "raid_log_import" }));

    expect(response.status).toBe(401);
    expect(mockSelectDistinct).not.toHaveBeenCalled();
    expect(mockEvaluateAchievementsForFamilies).not.toHaveBeenCalled();
  });

  it("rejects a malformed body (missing raidId) — no evaluation attempted", async () => {
    mockVerifyQstashRequest.mockResolvedValue({
      valid: true,
      body: JSON.stringify({ trigger: "raid_log_import" }),
    });

    const { POST } = await import("~/app/api/qstash/achievement-evaluate/route");
    const response = await POST(makeRequest({ trigger: "raid_log_import" }));

    expect(response.status).toBe(400);
    expect(mockEvaluateAchievementsForFamilies).not.toHaveBeenCalled();
  });

  it("evaluates exactly the triggering raid's distinct families, not a broader roster, in one batch call", async () => {
    mockVerifyQstashRequest.mockResolvedValue({
      valid: true,
      body: JSON.stringify({ raidId: 42, trigger: "raid_log_import" }),
    });
    selectDistinctRows = [{ primaryCharacterId: 1 }, { primaryCharacterId: 2 }];
    mockEvaluateAchievementsForFamilies.mockResolvedValue(
      new Map([
        [1, { newAwards: [] }],
        [2, { newAwards: [] }],
      ]),
    );

    const { POST } = await import("~/app/api/qstash/achievement-evaluate/route");
    const response = await POST(makeRequest({ raidId: 42, trigger: "raid_log_import" }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(mockEvaluateAchievementsForFamilies).toHaveBeenCalledTimes(1);
    expect(mockEvaluateAchievementsForFamilies).toHaveBeenCalledWith(
      expect.anything(),
      [1, 2],
      expect.any(Date),
    );
    expect(responseBody).toMatchObject({ raidId: 42, familiesEvaluated: 2, newAwards: 0 });
  });

  it("does not let one family's evaluation failure prevent another family's from completing", async () => {
    mockVerifyQstashRequest.mockResolvedValue({
      valid: true,
      body: JSON.stringify({ raidId: 42, trigger: "signup_link_resolved" }),
    });
    selectDistinctRows = [{ primaryCharacterId: 1 }, { primaryCharacterId: 2 }];
    mockEvaluateAchievementsForFamilies.mockResolvedValue(
      new Map([
        [1, { error: new Error("malformed signup snapshot") }],
        [2, { newAwards: [{ achievementTierId: "t1", primaryCharacterId: 2 }] }],
      ]),
    );

    const { POST } = await import("~/app/api/qstash/achievement-evaluate/route");
    const response = await POST(makeRequest({ raidId: 42, trigger: "signup_link_resolved" }));
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(mockEvaluateAchievementsForFamilies).toHaveBeenCalledTimes(1);
    expect(responseBody).toMatchObject({ familiesEvaluated: 2, newAwards: 1, failures: 1 });
  });
});
