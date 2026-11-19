import { NextResponse } from "next/server";

/**
 * JSON response helper for the `/api/discord/*` routes.
 *
 * This used to gzip the body here and set `Content-Encoding: gzip`. Next 16.4.5 added
 * `content-encoding` to the FORBIDDEN_HEADERS it strips from a Route Handler's Response
 * (`next/dist/server/send-response.js`) — without decompressing the body. So from the 16.4.6
 * bump (PR #199) onward every caller got raw gzip bytes labelled `application/json` and died on
 * `JSON.parse`, which took out the Discord bot and, via the same trick in the tRPC route, every
 * client-side query on the site. Vercel compresses responses on the way out anyway, so doing it
 * by hand bought nothing and now costs correctness.
 *
 * Kept as an async two-argument function so the ~50 call sites are untouched; `request` is no
 * longer read.
 */
export async function compressResponse(data: unknown, _request?: Request): Promise<NextResponse> {
  return NextResponse.json(data);
}
