import { NextResponse } from "next/server";
import { z } from "zod";
import { decryptToken } from "~/server/api/token-crypto";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/schema";
import { and, eq } from "drizzle-orm";
import { getBaseUrl } from "~/lib/get-base-url";
import { env } from "~/env.js";
import { logger } from "~/lib/logger";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const API_VERSIONS = ["v1", "v2"] as const;

const ProxySchema = z.object({
  method: z
    .string()
    .toUpperCase()
    .refine((m) => ALLOWED_METHODS.has(m), {
      message: "method must be GET, POST, PUT, PATCH, or DELETE",
    }),
  apiVersion: z.enum(API_VERSIONS).default("v1"),
  path: z
    .string()
    .min(1)
    .startsWith("/")
    .transform((p) => {
      try {
        const url = new URL(`http://x${p}`);
        return `${url.pathname}${url.search}` || "/";
      } catch {
        return p;
      }
    })
    .pipe(
      z
        .string()
        .startsWith("/")
        .refine((p) => !p.startsWith("/discord/proxy") && !p.startsWith("/admin/proxy"), {
          message: "Recursive proxy calls are not allowed",
        }),
    ),
  body: z.unknown().optional(),
});

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

    const parsed = ProxySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { method, apiVersion, path, body: proxyBody } = parsed.data;
    const { discordId } = await params;

    if (!/^\d{17,19}$/.test(discordId)) {
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
    // Note: only raid managers/admins can toggle templarEnabled (enforced at the
    // PATCH /me/templar endpoint and the setTemplarEnabled tRPC mutation). If a
    // user later loses their manager role, their proxied calls will still be
    // attempted but will fail at the endpoint level via raidManagerProcedure.
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
