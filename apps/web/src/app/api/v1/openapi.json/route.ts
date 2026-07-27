import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { buildOpenApiSpec } from "~/lib/openapi-registry";

const spec = buildOpenApiSpec();

export async function GET() {
  try {
    return NextResponse.json(spec);
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
