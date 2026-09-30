/**
 * Shared client for fetching raid data from the SoftRes API.
 * Used by both the softres router (SoftRes Scan) and the raid-helper router
 * (SoftRes Links column on the Upcoming Events dashboard widget).
 */

import { TRPCError } from "@trpc/server";
import type { SoftResRaidData } from "~/server/api/interfaces/softres";
import { getClassNameBySoftResSpecId } from "~/lib/softres-spec-ids";
import { logger } from "~/lib/logger";

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
  raid_date: number | null; // Unix seconds; null unless the raid was linked through Raid Helper
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
    raidDate: new Date((raw.raid_date ?? 0) * 1000).toISOString(),
    raidTimestamp: raw.raid_date ?? null,
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
  /** The same raid's public (no-token) page — safe to post anywhere, unlike `adminUrl`. */
  publicUrl: string;
  /**
   * Whether the requested hard reserves were applied. `true` when none were requested — the
   * raid is in the state the caller asked for either way. `false` means the SR exists and is
   * usable but its items are still soft-reservable; see `createSoftResRaid`.
   */
  hardReservesApplied: boolean;
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
 *
 * `hardReserveItemIds`, when non-empty, is applied by a second POST after the create — SoftRes's
 * create form carries no hard-reserve field, so this cannot be folded into the call above. That
 * POST is best-effort: a failure is logged and reported as `hardReservesApplied: false` rather
 * than thrown, because by that point the admin token has already been parsed and only exists in
 * this function's locals. Throwing would strand an SR that nobody can ever administer.
 */
export async function createSoftResRaid(
  instanceId: number,
  hardReserveItemIds: readonly number[] = [],
): Promise<CreatedSoftResRaid> {
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
    // Log only the path, never the query string — a would-be adminToken can still be present
    // there even when the shape doesn't match what this regex expects, and this error is
    // logged upstream (`ensure-softres`/`create-softres`'s catch blocks), which is a wider
    // audience than the Token thread the token is otherwise confined to.
    const [pathOnly] = location.split("?");
    throw new Error(`Could not parse SoftRes admin link from redirect: ${pathOnly}`);
  }
  const [, raidId, adminToken] = match;
  // `location` may be relative ("/raid/id?...") or already absolute, depending on how the
  // undocumented endpoint's redirect() call was invoked server-side — resolving against a base
  // handles both instead of assuming relative and risking a doubled "https://softres.itthttps://...".
  const adminUrl = new URL(location, "https://softres.it").toString();

  // 3. Apply hard reserves. The session that created a raid is already its manager, so this
  // needs no admin token — but it does need the session, which may have been reissued by the
  // create POST, so re-read Set-Cookie off that response before falling back to the originals.
  //
  // The whole step is wrapped, not just the request: reading the cookies and decoding the XSRF
  // token both happen before `applyHardReserves` reaches its own try, and `decodeURIComponent`
  // throws `URIError` on a malformed percent-escape. Past this point `adminToken` exists only in
  // these locals, so anything that escapes here strands an SR nobody can ever administer.
  let hardReservesApplied = true;
  if (hardReserveItemIds.length > 0) {
    try {
      const refreshed = { ...cookies, ...parseSetCookieHeader(createRes.headers.getSetCookie()) };
      hardReservesApplied = await applyHardReserves(raidId!, hardReserveItemIds, refreshed);
    } catch (error) {
      // Only reachable for a throw *outside* applyHardReserves' own catch, which already
      // reports its failures by returning false — the two paths can't both log.
      logger.error(
        { raidId, itemIds: hardReserveItemIds, err: error },
        "Failed to apply SoftRes hard reserves; the SR was created without them",
      );
      hardReservesApplied = false;
    }
  }

  return {
    raidId: raidId!,
    adminToken: adminToken!,
    adminUrl,
    publicUrl: `https://softres.it/raid/${raidId}`,
    hardReservesApplied,
  };
}

/**
 * Sets a raid's hard reserves to exactly `itemIds`, using a session that already manages it.
 *
 * `POST /raid/{id}/hardReserve` **replaces** the whole set rather than adding to it, so the
 * caller passes the complete intended list. SoftRes answers 422 (leaving the stored set
 * untouched) if any id isn't available in that raid's instance.
 *
 * Returns whether it succeeded rather than throwing — see `createSoftResRaid`.
 */
async function applyHardReserves(
  raidId: string,
  itemIds: readonly number[],
  cookies: Record<string, string>,
): Promise<boolean> {
  const xsrfToken = decodeURIComponent(cookies["XSRF-TOKEN"] ?? "");
  try {
    const res = await fetch(`https://softres.it/raid/${raidId}/hardReserve`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://softres.it",
        referer: `https://softres.it/raid/${raidId}`,
        "x-inertia": "true",
        "x-requested-with": "XMLHttpRequest",
        "x-xsrf-token": xsrfToken,
        cookie: `XSRF-TOKEN=${cookies["XSRF-TOKEN"]}; softres_session_v2=${cookies["softres_session_v2"]}`,
      },
      body: JSON.stringify({ items: [...itemIds] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // A success is the same 302-to-the-raid-page redirect the create POST gives.
    if (res.status >= 200 && res.status < 400) return true;

    logger.error(
      { raidId, itemIds, status: res.status },
      "SoftRes rejected the hard-reserve request; the SR was created without hard reserves",
    );
    return false;
  } catch (error) {
    logger.error(
      { raidId, itemIds, err: error },
      "Failed to apply SoftRes hard reserves; the SR was created without them",
    );
    return false;
  }
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
