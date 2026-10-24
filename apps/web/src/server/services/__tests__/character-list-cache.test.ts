import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("~/server/db", () => ({ db: {} }));

import { characterFilterPredicate } from "~/server/services/character-list-cache";

const dialect = new PgDialect();
const render = (filter: Parameters<typeof characterFilterPredicate>[0]) => {
  const q = dialect.sqlToQuery(characterFilterPredicate(filter));
  return { sql: q.sql, params: q.params };
};

describe("characterFilterPredicate", () => {
  it("primary matches only primary characters", () => {
    expect(render("primary").params).toEqual([true]);
    expect(render("primary").sql).toContain("=");
  });

  it("secondary matches only non-primary characters", () => {
    expect(render("secondary").params).toEqual([false]);
    expect(render("secondary").sql).toContain("=");
  });

  it("all matches both values", () => {
    expect(render("all").sql).toContain("in");
    expect(render("all").params).toEqual([true, false]);
  });

  it("secondaryEligible falls through to the unfiltered default (it has its own query)", () => {
    expect(render("secondaryEligible").params).toEqual([true, false]);
  });
});
