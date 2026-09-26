import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { buildOpenApiSpec } from "~/lib/openapi-registry";
import { buildEndpointIndex, buildSpecFragment, listTags } from "~/lib/api-endpoint-index";

// One tag's slice of the OpenAPI document — small enough to fetch whole, unlike openapi.json.
// Deliberately not in the OpenAPI spec itself. TEMPLE-125.
const spec = buildOpenApiSpec();
const tags = listTags(buildEndpointIndex(spec));

export function GET(request: Request) {
  try {
    const tag = new URL(request.url).searchParams.get("tag");
    if (!tag) {
      return NextResponse.json({ error: "Missing ?tag=", tags }, { status: 400 });
    }
    const fragment = buildSpecFragment(spec, tag);
    if (!fragment) {
      return NextResponse.json({ error: `Unknown tag "${tag}"`, tags }, { status: 404 });
    }
    return NextResponse.json(fragment);
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
