import { describe, expect, it } from "vitest";
import { GET as getIndex } from "~/app/api/v1/endpoints/route";
import { GET as getSpec } from "~/app/api/v1/endpoints/spec/route";

const url = (path: string) => new Request(`http://localhost${path}`);

describe("GET /api/v1/endpoints", () => {
  it("lists the index, its tags, and needs no auth", async () => {
    const res = getIndex(url("/api/v1/endpoints"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(body.endpoints.length);
    expect(body.tags).toContain("Achievements");
  });

  it("filters by q, tag and method", async () => {
    const body = await getIndex(
      url("/api/v1/endpoints?q=grant&tag=Achievements&method=post"),
    ).json();
    expect(body.endpoints.map((e: { path: string }) => e.path)).toEqual([
      "/api/v1/achievements/{id}/grant",
    ]);
  });
});

describe("GET /api/v1/endpoints/spec", () => {
  it("returns one tag's slice of the OpenAPI document", async () => {
    const res = getSpec(url("/api/v1/endpoints/spec?tag=Achievements"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.0.0");
    expect(Object.keys(body.paths)).toHaveLength(2);
  });

  it("400s without a tag and 404s on an unknown one, listing the valid tags both times", async () => {
    const missing = getSpec(url("/api/v1/endpoints/spec"));
    expect(missing.status).toBe(400);
    expect((await missing.json()).tags).toContain("Characters");

    const unknown = getSpec(url("/api/v1/endpoints/spec?tag=Nope"));
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).tags).toContain("Characters");
  });
});
