#!/usr/bin/env node
// Proves a deployed build answers with JSON a client can actually parse.
//
// On 2026-11-18 a Next patch bump (16.4.1 -> 16.4.6) broke every API response on the site for
// ~22 hours. Next 16.4.5 began stripping `content-encoding` from a Route Handler's Response
// without decompressing the body, so our hand-gzipped payloads went out as raw gzip bytes
// labelled `application/json`. Every request answered **200 with correct data computed**; only
// `JSON.parse` in the caller failed. Nothing server-side had a symptom: no 5xx, no error log,
// a reachable database, a green build. The one signal was in a browser console.
//
// So this asserts the only thing that was false: that the bytes parse.
//
// It is deliberately secret-free. The `/api/discord/*` check uses the unauthenticated path,
// which returns `{"error":"Unauthorized"}` through the very same response helper that broke —
// so it covers the bot's contract without a token in CI.
import process from "node:process";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "https://www.temple-era.com").replace(/\/$/, "");
// When set, the run waits for /api/health to report this SHA before asserting anything, so it
// cannot pass against the build the deploy replaced.
const expectedCommit = process.env.SMOKE_EXPECTED_COMMIT?.trim() || null;
// Overridable so the freshness gate itself can be exercised without a five-minute test.
const FRESHNESS_TIMEOUT_MS = Number(process.env.SMOKE_FRESHNESS_TIMEOUT_MS ?? 5 * 60 * 1000);
const POLL_INTERVAL_MS = 10_000;
// Each request is bounded on its own. The freshness deadline is only re-checked between
// requests, so a connection that is accepted and then never answered would otherwise park the
// await inside the poll loop indefinitely and the five-minute budget would never expire.
const REQUEST_TIMEOUT_MS = 20_000;
const GZIP_MAGIC = [0x1f, 0x8b];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads a response as bytes, not text, because the failure this guards against is a body that
 * *looks* like JSON by its headers and is not text at all. `response.json()` would collapse the
 * interesting case into an opaque parse error with no way to say what arrived instead.
 */
async function read(path, init) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { response, bytes };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${path} did not answer within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  }
}

function describeBody(bytes) {
  if (bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]) {
    return "gzip-compressed bytes (the body is compressed but nothing said so)";
  }
  const text = new TextDecoder().decode(bytes.slice(0, 120));
  return `${JSON.stringify(text)}${bytes.length > 120 ? "…" : ""}`;
}

/** @returns {object} the parsed body, or throws with what actually came back. */
function parseOrExplain(path, response, bytes) {
  const contentType = response.headers.get("content-type") ?? "(none)";
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(
      `${path} answered ${response.status} with content-type "${contentType}" but the body is ` +
        `not parseable JSON: ${describeBody(bytes)}`,
    );
  }
}

async function waitForBuild() {
  if (!expectedCommit) {
    console.log(`[smoke] No SMOKE_EXPECTED_COMMIT given; testing whatever ${baseUrl} serves now.`);
    return;
  }
  const short = expectedCommit.slice(0, 8);
  const deadline = Date.now() + FRESHNESS_TIMEOUT_MS;
  let lastSeen = "(nothing yet)";

  while (Date.now() < deadline) {
    try {
      const { response, bytes } = await read("/api/health", { cache: "no-store" });
      const body = parseOrExplain("/api/health", response, bytes);
      if (body.commit === expectedCommit) {
        console.log(`[smoke] ${baseUrl} is serving ${short}; running assertions.`);
        return;
      }
      if (body.commit === null) {
        // The deploy does not expose VERCEL_GIT_COMMIT_SHA at runtime (Vercel's "Automatically
        // expose System Environment Variables" setting is off). Degrade to testing whatever is
        // live rather than failing an otherwise healthy deploy on a missing variable — the
        // assertions are still worth running, they just lose the guarantee of which build.
        console.warn(
          `[smoke] /api/health reports no commit, so freshness cannot be confirmed. Running the ` +
            `assertions against whatever ${baseUrl} currently serves. To restore the guarantee, ` +
            `turn on "Automatically expose System Environment Variables" in the Vercel project.`,
        );
        return;
      }
      lastSeen = body.commit.slice(0, 8);
    } catch (error) {
      // A health check that cannot be parsed is itself the bug this guards against, but during
      // the alias switch it is just as likely to be the old build or a cold start. Keep the
      // reason and let the assertions below be what fails.
      lastSeen = `unreadable (${error.message})`;
    }
    console.log(`[smoke] Waiting for ${short}; alias is serving ${lastSeen}.`);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `${baseUrl} never reported commit ${short} within ${FRESHNESS_TIMEOUT_MS / 1000}s ` +
      `(last seen: ${lastSeen}). Either the production alias did not move, or /api/health is ` +
      `itself broken on the new build.`,
  );
}

const checks = [
  {
    name: "tRPC query — what every page on the site uses",
    async run() {
      const path = "/api/trpc/dashboard.getAllRaidsCurrentLockout";
      const { response, bytes } = await read(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path} answered ${response.status}, expected 200`);
      const body = parseOrExplain(path, response, bytes);
      if (!("result" in body)) {
        throw new Error(`${path} parsed but carries no "result": ${JSON.stringify(body).slice(0, 200)}`);
      }
    },
  },
  {
    name: "Discord bot endpoint — the unauthenticated path, same response helper",
    async run() {
      const path = "/api/discord/check-permissions";
      const { response, bytes } = await read(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (response.status !== 401) {
        throw new Error(`${path} answered ${response.status} to an unauthenticated POST, expected 401`);
      }
      const body = parseOrExplain(path, response, bytes);
      if (typeof body.error !== "string") {
        throw new Error(`${path} parsed but carries no "error" string: ${JSON.stringify(body).slice(0, 200)}`);
      }
    },
  },
];

try {
  await waitForBuild();
} catch (error) {
  // A stack trace here would bury the one line an operator needs out of a deploy log.
  console.error(`[smoke] ${error.message}`);
  process.exit(1);
}

const failures = [];
for (const check of checks) {
  try {
    await check.run();
    console.log(`[smoke] ✓ ${check.name}`);
  } catch (error) {
    console.error(`[smoke] ✗ ${check.name}`);
    console.error(`[smoke]   ${error.message}`);
    failures.push(check.name);
  }
}

if (failures.length > 0) {
  console.error(`[smoke] ${failures.length} of ${checks.length} checks failed against ${baseUrl}.`);
  process.exit(1);
}
console.log(`[smoke] All ${checks.length} checks passed against ${baseUrl}.`);
