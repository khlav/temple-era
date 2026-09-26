import { NextResponse } from "next/server";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { buildCapabilityReport } from "~/lib/api-capabilities";

// Which data Temple stores and which surfaces (REST, GraphQL, SQL) can read it, with the calling
// token's own scopes applied to the write routes. Deliberately not in the OpenAPI spec (a frozen
// external contract — see the root AGENTS.md). TEMPLE-125.
export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    return NextResponse.json(buildCapabilityReport(authResult.user.scopes));
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
