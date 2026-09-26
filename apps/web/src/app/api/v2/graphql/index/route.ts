import { NextResponse } from "next/server";
import { schema } from "~/server/api/v2/schema";
import { buildGraphQLIndex, searchGraphQLIndex } from "~/server/api/v2/helpers/schema-index";

// A searchable field index of the schema, public like the SDL at ./schema.graphql (it exposes the
// same names). TEMPLE-125.
const index = buildGraphQLIndex(schema);

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = searchGraphQLIndex(index, { q: params.get("q"), type: params.get("type") });
  return NextResponse.json({ count: result.fields.length, ...result });
}
