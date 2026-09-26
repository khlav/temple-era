import { describe, expect, it, vi } from "vitest";

vi.mock("~/env.js", () => ({ env: {} }));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));

import { GET } from "~/app/api/v2/graphql/index/route";

describe("GET /api/v2/graphql/index", () => {
  it("returns a searchable field index without auth, like the SDL", async () => {
    const res = GET(new Request("http://localhost/api/v2/graphql/index?q=achievements"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(body.fields.length);
    expect(body.fields.map((f: { field: string }) => f.field)).toContain("achievements");
  });

  it("narrows to a parent type", async () => {
    const body = await GET(new Request("http://localhost/api/v2/graphql/index?type=Query")).json();
    expect(body.fields.every((f: { type: string }) => f.type === "Query")).toBe(true);
  });
});
