import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { buildOpenApiSpec } from "~/lib/openapi-registry";
import { buildEndpointIndex, listTags, searchEndpoints } from "~/lib/api-endpoint-index";

// Deliberately not in the OpenAPI spec (which is a frozen external contract — see the root
// AGENTS.md) and public like the spec itself: it is a searchable view of what openapi.json already
// says, plus the few routes that are left out of it. TEMPLE-125.
const index = buildEndpointIndex(buildOpenApiSpec());

export function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const endpoints = searchEndpoints(index, {
      q: params.get("q"),
      tag: params.get("tag"),
      method: params.get("method"),
    });
    return NextResponse.json({ count: endpoints.length, tags: listTags(index), endpoints });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
