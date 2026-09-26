import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { buildOpenApiSpec } from "~/lib/openapi-registry";
import { buildEndpointIndex, buildSpecFragment, listTags } from "~/lib/api-endpoint-index";

// One tag's slice of the OpenAPI document — small enough to fetch whole, unlike openapi.json.
// Deliberately not in the OpenAPI spec itself. TEMPLE-125.
const spec = buildOpenApiSpec();
const index = buildEndpointIndex(spec);
// Only tags that have at least one spec operation can produce a fragment. The off-spec routes'
// tags (SoftRes, Admin) appear in the endpoint index but not here, or a caller walking this list
// would hit a guaranteed 404.
const tags = listTags(index.filter((entry) => entry.inSpec));
const offSpecTags = new Set(listTags(index.filter((entry) => !entry.inSpec)));

export function GET(request: Request) {
  try {
    const tag = new URL(request.url).searchParams.get("tag");
    if (!tag) {
      return NextResponse.json({ error: "Missing ?tag=", tags }, { status: 400 });
    }
    const fragment = buildSpecFragment(spec, tag);
    if (!fragment) {
      const offSpec = [...offSpecTags].some((t) => t.toLowerCase() === tag.toLowerCase());
      const error = offSpec
        ? `Tag "${tag}" has no OpenAPI fragment: its routes are not in the spec. ` +
          `List them with /api/v1/endpoints?tag=${encodeURIComponent(tag)}`
        : `Unknown tag "${tag}"`;
      return NextResponse.json({ error, tags }, { status: 404 });
    }
    return NextResponse.json(fragment);
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
