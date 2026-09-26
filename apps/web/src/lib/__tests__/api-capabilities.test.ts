import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/env.js", () => ({ env: {} }));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));

import * as dbSchema from "~/server/db/schema";
import { schema } from "~/server/api/v2/schema";
import { buildGraphQLIndex } from "~/server/api/v2/helpers/schema-index";
import { buildOpenApiSpec } from "~/lib/openapi-registry";
import { buildEndpointIndex } from "~/lib/api-endpoint-index";
import { buildCapabilityReport, CAPABILITY_DOMAINS } from "~/lib/api-capabilities";
import { SCOPE } from "~/lib/scopes";

const endpoints = buildEndpointIndex(buildOpenApiSpec());
const graphqlFields = new Set(buildGraphQLIndex(schema).fields.map((f) => `${f.type}.${f.field}`));
const normalize = (path: string) => path.replace(/\{[^}]+\}/g, "{}");

// Every claim in the registry is checked against the real thing, so it can't quietly rot.
describe("CAPABILITY_DOMAINS", () => {
  it("accounts for every table in the schema exactly once", () => {
    // Widened to unknown[] first: the schema module also exports enums, views and relations, and
    // the type guard narrows a union of those awkwardly otherwise.
    const actual = (Object.values(dbSchema) as unknown[])
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => getTableName(table));
    const claimed = CAPABILITY_DOMAINS.flatMap((d) => d.tables);
    expect(new Set(claimed).size).toBe(claimed.length); // no table in two domains
    expect(claimed.sort()).toEqual([...actual].sort());
  });

  it("only lists REST reads that exist as GET routes", () => {
    const known = new Set(endpoints.map((e) => `${e.method} ${normalize(e.path)}`));
    const missing = CAPABILITY_DOMAINS.flatMap((d) => d.read.rest).filter((r) => {
      const [method, path] = r.split(" ") as [string, string];
      return method !== "GET" || !known.has(`GET ${normalize(path)}`);
    });
    expect(missing).toEqual([]);
  });

  it("only lists GraphQL reads that exist in the schema", () => {
    const missing = CAPABILITY_DOMAINS.flatMap((d) => d.read.graphql).filter(
      (field) => !graphqlFields.has(field),
    );
    expect(missing).toEqual([]);
  });

  it("only lists writes that exist, with the scope the route's own description names", () => {
    for (const write of CAPABILITY_DOMAINS.flatMap((d) => d.write)) {
      const entry = endpoints.find(
        (e) => e.method === write.method && normalize(e.path) === normalize(write.path),
      );
      expect(entry, `${write.method} ${write.path}`).toBeDefined();
      if (write.scope && entry!.scopes.length > 0) {
        expect(entry!.scopes, `${write.method} ${write.path}`).toContain(write.scope);
      }
    }
  });

  it("matches the tables actually granted to the reporting role in the migrations", () => {
    const dir = join(__dirname, "../../../drizzle");
    const granted = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8").replace(/^--.*$/gm, "");
      for (const statement of sql.matchAll(
        /GRANT\s+SELECT\s+ON\s+([^;]+?)\s+TO\s+reports_readonly/gi,
      )) {
        for (const table of statement[1]!.matchAll(/\b((?:public|views)\.[a-z_0-9]+)\b/g)) {
          granted.add(table[1]!);
        }
      }
    }
    const claimed = CAPABILITY_DOMAINS.flatMap((d) => d.read.sql);
    expect(claimed.sort()).toEqual([...granted].sort());
  });
});

describe("buildCapabilityReport", () => {
  it("separates 'not stored' from 'stored but not readable'", () => {
    const report = buildCapabilityReport([]);
    const byId = Object.fromEntries(report.domains.map((d) => [d.id, d]));
    expect(byId.softres).toMatchObject({ stored: false, readable: { any: false } });
    expect(byId["signup-history"]).toMatchObject({ stored: true, readable: { any: false } });
    expect(byId.achievements).toMatchObject({
      stored: true,
      readable: { rest: false, graphql: true, sql: true, any: true },
    });
  });

  it("marks a write as allowed only when the caller holds its scope", () => {
    const without = buildCapabilityReport([]);
    const withScope = buildCapabilityReport([SCOPE.ACHIEVEMENT_MANAGE]);
    const grant = (r: typeof without) =>
      r.domains.find((d) => d.id === "achievements")!.write.find((w) => w.path.endsWith("/grant"))!;
    expect(grant(without).allowed).toBe(false);
    expect(grant(withScope).allowed).toBe(true);
  });

  it("treats a write that needs no scope as allowed for any valid token", () => {
    const report = buildCapabilityReport([]);
    const templar = report.domains
      .flatMap((d) => d.write)
      .find((w) => w.path === "/api/v1/me/templar");
    expect(templar?.allowed).toBe(true);
  });
});
