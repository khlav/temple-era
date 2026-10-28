import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * resolveUserAccess caches each user's role scopes (TEMPLE-165). A write to `role` or `user_role`
 * that doesn't call invalidateUserAccessCache() leaves the old scopes in force for up to the
 * cache's 15-minute fallback, revoked permissions included. This fails when a function or tRPC
 * procedure writes either table without calling it.
 */

const SRC = join(__dirname, "../../..");
const WRITE = /\.(insert|update|delete)\((userRoles|roles)\)/g;
// A write's scope runs from the nearest function or procedure start above it to the next one.
const BOUNDARY =
  /^(export )?(async )?function |^ {2}[A-Za-z]+: (scopedProcedure|protectedProcedure|publicProcedure|adminProcedure)\b/gm;

// Writers whose cache expiry happens in a caller rather than beside the write, with the reason.
const EXPIRED_BY_CALLER: Record<string, string> = {
  "server/services/discord-role-sync.ts:applyDiscordRoleBindings":
    "only called by syncDiscordRoles, which expires the cache in a finally block",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function writesWithoutExpiry() {
  const missing: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    const path = relative(SRC, file).replaceAll("\\", "/");
    const starts = [...source.matchAll(BOUNDARY)].map((m) => m.index);
    for (const write of source.matchAll(WRITE)) {
      const start = Math.max(0, ...starts.filter((i) => i <= write.index));
      const end = Math.min(source.length, ...starts.filter((i) => i > write.index));
      const scope = source.slice(start, end);
      if (scope.includes("invalidateUserAccessCache(")) continue;
      const name = /function (\w+)|^ {2}(\w+):/m.exec(scope);
      const where = `${path}:${name?.[1] ?? name?.[2] ?? "?"}`;
      if (!(where in EXPIRED_BY_CALLER)) missing.push(`${where} (${write[0]})`);
    }
  }
  return missing;
}

describe("user-access cache expiry", () => {
  it("every write to role or user_role expires the cached user access", () => {
    expect(writesWithoutExpiry()).toEqual([]);
  });

  it("finds the writes it is meant to check", () => {
    // Guards the guard: if the pattern stopped matching, the test above would pass vacuously.
    const count = sourceFiles(SRC).reduce(
      (n, file) => n + [...readFileSync(file, "utf8").matchAll(WRITE)].length,
      0,
    );
    expect(count).toBeGreaterThanOrEqual(9);
  });
});
