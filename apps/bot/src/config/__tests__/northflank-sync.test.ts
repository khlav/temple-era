import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The bot's environment reaches Northflank only through `sync-bot-secrets.yml`. A variable that
 * `env.ts` reads but the workflow doesn't manage has to be added to Northflank by hand, and a
 * required one that is forgotten shows up as a startup crash after deploy — not a build error.
 * These tests turn that into a failing test here instead.
 */
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const envSource = read("../env.ts");
const workflow = read("../../../../../.github/workflows/sync-bot-secrets.yml");

// Read by env.ts but deliberately not synced: it has a sensible default and is not set in the
// Northflank group. Add to this list only with a reason.
const UNMANAGED = ["LOG_LEVEL"];

/** config key -> env var name, for every `key: process.env.NAME` in env.ts. */
const envVarByConfigKey = new Map<string, string>(
  [...envSource.matchAll(/(\w+):\s*\(?process\.env\.([A-Z0-9_]+)/g)].map((m) => [m[1]!, m[2]!]),
);

/** The env vars env.ts refuses to start without. */
function requiredEnvVars(): string[] {
  const block = /const required = \[([\s\S]*?)\];/.exec(envSource)?.[1] ?? "";
  const keys = [...block.matchAll(/"(\w+)"/g)].map((m) => m[1]!);
  // Array-valued, so it is validated by its own length check rather than the list above.
  if (envSource.includes("discordRaidSrChannelIds.length")) keys.push("discordRaidSrChannelIds");
  return keys.map((k) => envVarByConfigKey.get(k)).filter((v): v is string => Boolean(v));
}

function workflowList(name: "REQUIRED_KEYS" | "OPTIONAL_KEYS"): string[] {
  const line = new RegExp(`^\\s*${name}:\\s*(.+)$`, "m").exec(workflow)?.[1] ?? "";
  return line.trim().split(/\s+/).filter(Boolean);
}

describe("sync-bot-secrets.yml covers the bot's environment", () => {
  const managedRequired = workflowList("REQUIRED_KEYS");
  const managedOptional = workflowList("OPTIONAL_KEYS");

  it("finds what it is checking (guards against the parsing silently matching nothing)", () => {
    expect(requiredEnvVars().length).toBeGreaterThanOrEqual(8);
    expect(managedRequired.length).toBeGreaterThanOrEqual(8);
  });

  it("syncs every variable env.ts requires", () => {
    const missing = requiredEnvVars().filter((v) => !managedRequired.includes(v));
    expect(missing, `env.ts requires these but sync-bot-secrets.yml does not manage them`).toEqual(
      [],
    );
  });

  it("manages every other variable env.ts reads, except the deliberate exceptions", () => {
    const all = [...envVarByConfigKey.values()];
    const unmanaged = all.filter(
      (v) => !managedRequired.includes(v) && !managedOptional.includes(v) && !UNMANAGED.includes(v),
    );
    expect(unmanaged).toEqual([]);
  });

  it("lists every Actions secret the step receives, so none is silently never synced", () => {
    // The reverse of the check below: a `secrets.X` line added to the step's env without
    // listing X in REQUIRED_KEYS / OPTIONAL_KEYS would be passed in and then ignored.
    const CI_INFRASTRUCTURE = ["NORTHFLANK_ACCESS_TOKEN"]; // authenticates the sync, never synced
    const passedIn = [...workflow.matchAll(/^\s+([A-Z0-9_]+): \$\{\{ secrets\.\1 \}\}/gm)].map(
      (m) => m[1]!,
    );
    const unlisted = passedIn.filter(
      (k) =>
        !CI_INFRASTRUCTURE.includes(k) &&
        !managedRequired.includes(k) &&
        !managedOptional.includes(k),
    );
    expect(passedIn.length).toBeGreaterThan(8);
    expect(unlisted).toEqual([]);
  });

  it("maps every managed key to the Actions secret of the same name", () => {
    for (const key of [...managedRequired, ...managedOptional]) {
      expect(workflow, `${key} is listed but not passed to the step`).toContain(
        `${key}: \${{ secrets.${key} }}`,
      );
    }
  });
});
