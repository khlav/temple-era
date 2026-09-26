import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { SCOPE } from "~/lib/scopes";

const mockValidateApiToken = vi.fn();
vi.mock("~/server/api/v1-auth", () => ({
  validateApiToken: (...args: unknown[]) => mockValidateApiToken(...args),
}));

import { GET } from "~/app/api/v1/capabilities/route";

beforeEach(() => mockValidateApiToken.mockReset());

describe("GET /api/v1/capabilities", () => {
  it("rejects a missing or invalid token with the auth helper's own response", async () => {
    mockValidateApiToken.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request("http://localhost/api/v1/capabilities"));
    expect(res.status).toBe(401);
  });

  it("reports domains with the caller's own scopes applied to the write routes", async () => {
    mockValidateApiToken.mockResolvedValue({
      user: { id: "u1", scopes: [SCOPE.ACHIEVEMENT_MANAGE] },
    });
    const res = await GET(new Request("http://localhost/api/v1/capabilities"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scopes).toEqual([SCOPE.ACHIEVEMENT_MANAGE]);
    const achievements = body.domains.find((d: { id: string }) => d.id === "achievements");
    expect(achievements.readable).toMatchObject({ rest: false, graphql: true, sql: true });
    expect(achievements.write.every((w: { allowed: boolean }) => w.allowed)).toBe(true);
  });
});
