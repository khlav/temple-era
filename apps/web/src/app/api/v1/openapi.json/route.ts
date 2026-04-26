import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "~/lib/openapi-registry";

const spec = buildOpenApiSpec();

export async function GET() {
  try {
    return NextResponse.json(spec);
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
