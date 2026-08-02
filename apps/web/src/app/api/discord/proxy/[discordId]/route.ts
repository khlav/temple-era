import { NextResponse } from "next/server";
import { ProxyDiscordIdSchema, ProxyRequestSchema } from "@temple-era/contracts";
import { decryptToken } from "~/server/api/token-crypto";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/schema";
import { and, eq } from "drizzle-orm";
import { getBaseUrl } from "~/lib/get-base-url";
import { env } from "~/env.js";
import { logger } from "~/lib/logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ discordId: string }> },
) {
  try {
    // 1. Verify bot service key (same pattern as all /api/discord/* endpoints)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      logger.warn(
        {
          ip: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
          timestamp: new Date().toISOString(),
        },
        "Unauthorized discord proxy attempt",
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse and validate request body
    let body: unknown;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ProxyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { method, apiVersion, path, body: proxyBody } = parsed.data;
    const { discordId } = await params;

    if (!ProxyDiscordIdSchema.safeParse(discordId).success) {
      return NextResponse.json({ error: "Invalid Discord user ID" }, { status: 400 });
    }

    // 3. Look up user by Discord ID via accounts table
    const userResult = await db
      .select({
        id: users.id,
        templarEnabled: users.templarEnabled,
        apiTokenEncrypted: users.apiTokenEncrypted,
      })
      .from(users)
      .innerJoin(accounts, eq(accounts.userId, users.id))
      .where(and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, discordId)))
      .limit(1);

    if (userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetUser = userResult[0]!;

    // 4. Check opt-in.
    // Note: only users with the templar:access scope can toggle templarEnabled (enforced at the
    // PATCH /me/templar endpoint and the setTemplarEnabled tRPC mutation via scopedProcedure). If
    // a user later loses that scope, their proxied calls will still be attempted but will fail at
    // the endpoint level via the same templar:access scope check.
    if (!targetUser.templarEnabled) {
      return NextResponse.json({ error: "Templar access not enabled" }, { status: 403 });
    }

    // 5. Decrypt token
    if (!targetUser.apiTokenEncrypted) {
      return NextResponse.json(
        {
          error:
            "User has no encrypted token. They must regenerate their API token to enable Templar proxy.",
        },
        { status: 409 },
      );
    }

    let plainToken: string;
    try {
      plainToken = decryptToken(targetUser.apiTokenEncrypted);
    } catch {
      return NextResponse.json({ error: "Failed to decrypt user token" }, { status: 500 });
    }

    // 6. Forward the request to the target API version
    const baseUrl = getBaseUrl(request);
    const targetUrl = `${baseUrl}/api/${apiVersion}${path}`;

    const proxyHeaders: HeadersInit = {
      Authorization: `Bearer ${plainToken}`,
      "Content-Type": "application/json",
    };

    const hasBody = proxyBody !== undefined && method !== "GET";
    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers: proxyHeaders,
      body: hasBody ? JSON.stringify(proxyBody) : undefined,
    });

    // 7. Return the upstream response exactly as-is
    const upstreamText = await upstreamResponse.text();
    return new NextResponse(upstreamText, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "discord proxy error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
