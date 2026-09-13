/**
 * Shared client for fetching raid data from the SoftRes API.
 * Used by both the softres router (SoftRes Scan) and the raid-helper router
 * (SoftRes Links column on the Upcoming Events dashboard widget).
 */

import { TRPCError } from "@trpc/server";
import type { SoftResRaidData } from "~/server/api/interfaces/softres";
import { getClassNameBySoftResSpecId } from "~/lib/softres-spec-ids";

/**
 * Raw shape of `GET https://softres.it/api/raid/{id}`, trimmed to the fields
 * this client actually reads. SoftRes's real API predates and differs
 * substantially from the shape `SoftResRaidData` used to assume (no
 * top-level `instance`, `instances` is an array of zone objects rather than
 * plain id strings, reserves don't carry a class name, etc.) - this type
 * documents what's actually there so the mapping below stays honest.
 */
interface SoftResApiRaidResponse {
  id: string;
  raid_date: number; // Unix seconds
  instances?: Array<{ slug: string }>;
  reserves?: Array<{
    name: string;
    spec: number;
    items: number[];
    note: string | null;
  }>;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch SoftRes raid data from the API and normalize it to `SoftResRaidData`.
 */
export async function fetchSoftResRaidData(raidId: string): Promise<SoftResRaidData> {
  let response: Response;
  try {
    // A bare fetch() has no default timeout - if softres.it stalls rather than
    // erroring, this would otherwise hang indefinitely, and callers awaiting
    // several of these concurrently (e.g. Promise.all over scheduled events)
    // would hang their entire response on this one call.
    response = await fetch(`https://softres.it/api/raid/${raidId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch SoftRes data: ${err instanceof Error ? err.message : "request failed"}`,
    });
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `SoftRes raid with ID "${raidId}" not found`,
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch SoftRes data: ${response.statusText}`,
    });
  }

  const raw = (await response.json()) as SoftResApiRaidResponse;

  const instances = (raw.instances ?? []).map((i) => i.slug);

  return {
    raidId: raw.id,
    instance: instances[0] ?? null,
    instances,
    raidDate: new Date(raw.raid_date * 1000).toISOString(),
    reserved: (raw.reserves ?? []).map((r) => ({
      name: r.name,
      class: getClassNameBySoftResSpecId(r.spec) ?? "Unknown",
      spec: r.spec,
      items: r.items,
      note: r.note ?? null,
    })),
  };
}

interface CreatedSoftResRaid {
  raidId: string;
  adminToken: string;
  adminUrl: string;
}

const DEFAULT_CREATE_SETTINGS = {
  edition: "classic",
  faction: "horde",
  protection: true,
  reserve_limit: 2,
  item_limit: 0,
  item_reserve_limit: 0,
  hide_reserves: false,
  notes_enabled: true,
  class_restrictions: true,
  raid_series_id: "",
} as const;

/**
 * Creates a new SoftRes raid for the given classic-edition instance id (see
 * `~/lib/softres-create-instance-ids` — a different id space from this file's `instance` slugs,
 * which are for the read endpoint only) and returns its admin link.
 *
 * Reverse-engineers an undocumented, unauthenticated Inertia.js/Laravel POST that returns no
 * body — only a 302 redirect whose `Location` header carries the admin token. Uses a fresh,
 * stateless anonymous session per call (one GET immediately before the create POST to obtain a
 * CSRF/session cookie pair, then discards it) rather than a persisted bot-account session —
 * softres.it's create endpoint requires no login, only a valid CSRF-protected session, confirmed
 * live against a real incognito-browser request.
 *
 * `redirect: "manual"` is load-bearing: the default `fetch` behavior of auto-following redirects
 * would discard the `Location` header entirely, losing the admin token. Note this behavior is
 * environment-sensitive — browsers yield an opaque `redirect` response for `redirect: "manual"`,
 * while Node's `undici` (what Next.js's Node runtime actually uses) yields a normal 3xx response
 * with a readable `Location` header, read directly below.
 */
export async function createSoftResRaid(instanceId: number): Promise<CreatedSoftResRaid> {
  // 1. Fresh anonymous session: GET any page, read Set-Cookie for XSRF-TOKEN + softres_session_v2.
  const sessionRes = await fetch("https://softres.it/", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const cookies = parseSetCookieHeader(sessionRes.headers.getSetCookie());
  const xsrfToken = decodeURIComponent(cookies["XSRF-TOKEN"] ?? "");
  if (!xsrfToken || !cookies["softres_session_v2"]) {
    throw new Error("Failed to establish a SoftRes session (no XSRF/session cookie in response)");
  }

  // 2. POST to create, WITHOUT following the redirect — the admin token lives in Location.
  const createRes = await fetch("https://softres.it/raid", {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      accept: "text/html, application/xhtml+xml",
      origin: "https://softres.it",
      referer: "https://softres.it/",
      "x-inertia": "true",
      "x-requested-with": "XMLHttpRequest",
      "x-xsrf-token": xsrfToken,
      cookie: `XSRF-TOKEN=${cookies["XSRF-TOKEN"]}; softres_session_v2=${cookies["softres_session_v2"]}`,
    },
    body: JSON.stringify({ ...DEFAULT_CREATE_SETTINGS, instances: [instanceId] }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const location = createRes.headers.get("location");
  if (!location) {
    throw new Error(`SoftRes raid creation did not return a redirect (status ${createRes.status})`);
  }
  const match = /\/raid\/([a-zA-Z0-9]+)\?adminToken=([a-zA-Z0-9]+)/.exec(location);
  if (!match) {
    throw new Error(`Could not parse SoftRes admin link from redirect: ${location}`);
  }
  const [, raidId, adminToken] = match;
  return { raidId: raidId!, adminToken: adminToken!, adminUrl: `https://softres.it${location}` };
}

/** Minimal Set-Cookie parser — only needs the two cookie values' raw content, not full cookie-attribute parsing. */
function parseSetCookieHeader(setCookieValues: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of setCookieValues) {
    const [pair] = raw.split(";");
    const [name, value] = pair?.split("=") ?? [];
    if (name && value) result[name] = value;
  }
  return result;
}
