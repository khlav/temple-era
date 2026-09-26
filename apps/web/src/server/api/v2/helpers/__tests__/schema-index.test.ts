import { describe, expect, it, vi } from "vitest";

// schema.ts pulls in context.ts (~/env) and the db module; only the schema *shape* matters here.
vi.mock("~/env.js", () => ({ env: {} }));
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));

import { schema } from "~/server/api/v2/schema";
import { buildGraphQLIndex, searchGraphQLIndex } from "~/server/api/v2/helpers/schema-index";

const index = buildGraphQLIndex(schema);

describe("buildGraphQLIndex", () => {
  it("lists root queries with their arguments and return types", () => {
    const character = index.fields.find((f) => f.type === "Query" && f.field === "character");
    expect(character).toMatchObject({ returns: "Character", args: [{ name: "id", type: "Int!" }] });
  });

  it("never lists introspection types", () => {
    expect(index.fields.some((f) => f.type.startsWith("__"))).toBe(false);
  });

  it("includes the achievement fields added for TEMPLE-124", () => {
    const owners = index.fields.filter((f) => f.field === "achievements").map((f) => f.type);
    expect(owners.sort()).toEqual(["Character", "CharacterFamily"]);
    const character = index.fields.find(
      (f) => f.type === "Character" && f.field === "achievements",
    );
    expect(character?.returns).toBe("[EarnedAchievement!]!");
    expect(character?.description).toMatch(/primary/i);
  });
});

describe("searchGraphQLIndex", () => {
  it("finds fields by name, type or description", () => {
    const hits = searchGraphQLIndex(index, { q: "achievement" });
    const names = hits.fields.map((f) => `${f.type}.${f.field}`);
    expect(names).toContain("Character.achievements");
    expect(names).toContain("EarnedAchievement.highestTier");
  });

  it("requires every term to match", () => {
    const hits = searchGraphQLIndex(index, { q: "achievement highestTier" });
    expect(hits.fields.map((f) => f.field)).toEqual(["highestTier"]);
  });

  it("narrows to one parent type, dropping enums", () => {
    const hits = searchGraphQLIndex(index, { type: "Query" });
    expect(hits.fields.every((f) => f.type === "Query")).toBe(true);
    expect(hits.enums).toEqual([]);
  });

  it("returns enum values when they match", () => {
    const hits = searchGraphQLIndex(index, { q: "ALCHEMY" });
    expect(hits.enums.some((e) => e.values.includes("ALCHEMY"))).toBe(true);
  });
});
