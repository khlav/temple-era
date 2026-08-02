import { NextResponse } from "next/server";
import {
  CheckPermissionsRequestSchema,
  RAIDLOG_MANAGE_SCOPE,
  firstIssueMessage,
  type CheckPermissionsResponse,
} from "@temple-era/contracts";
import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "~/env.js";
import { compressResponse } from "~/lib/compression";
import { resolveUserAccess } from "~/server/services/access-service";
import type { SCOPE } from "~/lib/scopes";

// The contracts package cannot import ~/lib/scopes (it is tied to a Postgres enum and is
// web-only), so it carries `raidlog:manage` as its own literal. This assignment is the
// compile-time proof that the two never drift: if either literal changes, this line stops
// typechecking.
const _scopeLiteralsAgree: typeof SCOPE.RAIDLOG_MANAGE = RAIDLOG_MANAGE_SCOPE;
void _scopeLiteralsAgree;

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    // Check if environment variable is set
    if (!env.TEMPLE_WEB_API_TOKEN) {
      logger.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      const response = await compressResponse({ error: "Server configuration error" }, request);
      return new NextResponse(response.body, {
        status: 500,
        headers: response.headers,
      });
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      logger.error(
        {
          ip: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
          timestamp: new Date().toISOString(),
        },
        "Unauthorized API access attempt",
      );
      const response = await compressResponse({ error: "Unauthorized" }, request);
      return new NextResponse(response.body, {
        status: 401,
        headers: response.headers,
      });
    }

    // 2. Validate request body
    const parsed = CheckPermissionsRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      const response = await compressResponse({ error: firstIssueMessage(parsed.error) }, request);
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }
    const { discordUserId } = parsed.data;

    // 3. Check user permissions
    const result = await db
      .select({
        id: users.id,
        userName: users.name,
      })
      .from(users)
      .innerJoin(accounts, eq(users.id, accounts.userId))
      .where(and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, discordUserId)))
      .limit(1);

    const matchedUser = result[0];
    if (!matchedUser) {
      const payload: CheckPermissionsResponse = {
        hasAccount: false,
        isRaidManager: false,
        scopes: [],
      };
      return await compressResponse(payload, request);
    }

    const access = await resolveUserAccess(matchedUser.id);

    // `scopes` is the field callers should gate on. `isRaidManager` is kept only because the
    // deployed bot and any other consumer still read it — see
    // docs/followups/legacy-access-booleans-cleanup.md for what has to happen before it goes.
    const payload: CheckPermissionsResponse = {
      hasAccount: true,
      isRaidManager: access.isRaidManager,
      scopes: access.scopes,
    };
    return await compressResponse(payload, request);
  } catch (error) {
    logger.error({ err: error }, "Error checking user permissions");
    const response = await compressResponse({ error: "Internal server error" }, request);
    return new NextResponse(response.body, {
      status: 500,
      headers: response.headers,
    });
  }
}
