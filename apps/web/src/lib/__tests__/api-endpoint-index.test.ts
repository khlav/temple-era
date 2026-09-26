import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "~/lib/openapi-registry";
import {
  buildEndpointIndex,
  buildSpecFragment,
  listTags,
  OFF_SPEC_ENDPOINTS,
  searchEndpoints,
} from "~/lib/api-endpoint-index";

const spec = buildOpenApiSpec();
const index = buildEndpointIndex(spec);

describe("buildEndpointIndex", () => {
  it("has one entry per spec operation, plus the off-spec routes", () => {
    const specOperations = Object.values(spec.paths ?? {}).reduce(
      (n, item) => n + ["get", "put", "post", "delete", "patch"].filter((m) => m in item).length,
      0,
    );
    expect(index).toHaveLength(specOperations + OFF_SPEC_ENDPOINTS.length);
  });

  it("marks token-gated routes and reads the required scope out of the description", () => {
    const create = index.find((e) => e.method === "POST" && e.path === "/api/v1/achievements");
    expect(create).toMatchObject({ auth: "token", inSpec: true });
    expect(create?.scopes).toContain("achievement:manage");
  });

  it("marks the off-spec routes as such", () => {
    const softres = index.find((e) => e.path === "/api/v1/softres");
    expect(softres).toMatchObject({ inSpec: false, scopes: ["softres:access"] });
  });
});

describe("searchEndpoints", () => {
  it("matches every term against path, summary, tags and scopes", () => {
    const hits = searchEndpoints(index, { q: "achievement grant" });
    expect(hits.map((e) => e.path)).toEqual(["/api/v1/achievements/{id}/grant"]);
  });

  it("filters by tag and method, case-insensitively", () => {
    const hits = searchEndpoints(index, { tag: "characters", method: "get" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.method === "GET" && e.tags.includes("Characters"))).toBe(true);
  });

  it("returns everything for an empty query and nothing for a miss", () => {
    expect(searchEndpoints(index, {})).toHaveLength(index.length);
    expect(searchEndpoints(index, { q: "no-such-route-anywhere" })).toEqual([]);
  });
});

describe("buildSpecFragment", () => {
  it("keeps only the tag's operations", () => {
    const fragment = buildSpecFragment(spec, "Achievements");
    expect(Object.keys(fragment?.paths ?? {}).sort()).toEqual([
      "/api/v1/achievements",
      "/api/v1/achievements/{id}/grant",
    ]);
  });

  it("is self-contained: every $ref resolves inside the fragment", () => {
    for (const tag of listTags(index)) {
      const fragment = buildSpecFragment(spec, tag);
      if (!fragment) continue; // off-spec tags have no spec operations
      const refs = [...JSON.stringify(fragment).matchAll(/#\/components\/schemas\/([^"]+)"/g)].map(
        (m) => m[1]!,
      );
      for (const ref of refs) {
        expect(fragment.components?.schemas, `${tag} -> ${ref}`).toHaveProperty(ref);
      }
    }
  });

  it("is much smaller than the whole document", () => {
    const whole = JSON.stringify(spec).length;
    expect(JSON.stringify(buildSpecFragment(spec, "Achievements")).length).toBeLessThan(whole / 5);
  });

  it("returns null for an unknown tag", () => {
    expect(buildSpecFragment(spec, "Nope")).toBeNull();
  });
});

// The index is only trustworthy if it can't silently miss a route. Every exported handler under
// app/api/v1 must be either in the OpenAPI spec or in OFF_SPEC_ENDPOINTS.
describe("route coverage", () => {
  const ROOT = join(__dirname, "../../app/api/v1");
  // The discovery routes themselves are deliberately not part of the spec (see their headers).
  const DISCOVERY_ROUTES = new Set([
    "GET /api/v1/openapi.json",
    "GET /api/v1/endpoints",
    "GET /api/v1/endpoints/spec",
    "GET /api/v1/capabilities",
  ]);
  const normalize = (path: string) => path.replace(/\{[^}]+\}/g, "{}");

  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return routeFiles(full);
      return name === "route.ts" ? [full] : [];
    });
  }

  const handlers = routeFiles(ROOT).flatMap((file) => {
    const path =
      "/api/v1" +
      file
        .slice(ROOT.length)
        .replaceAll("\\", "/")
        .replace(/\/route\.ts$/, "")
        .replace(/\[([^\]]+)\]/g, "{$1}");
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
      (m) => `${m[1]} ${path}`,
    );
  });

  it("finds the handlers it is meant to check", () => {
    expect(handlers.length).toBeGreaterThan(30);
  });

  it("lists every handler in the spec or the off-spec list", () => {
    const known = new Set(index.map((e) => `${e.method} ${normalize(e.path)}`));
    const missing = handlers
      .filter((h) => !DISCOVERY_ROUTES.has(h))
      .filter((h) => !known.has(h.replace(/\{[^}]+\}/g, "{}")));
    expect(missing).toEqual([]);
  });
});
