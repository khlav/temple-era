import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "~/env.js";
import { compressResponse } from "~/lib/compression";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    // Check if environment variable is set
    if (!env.TEMPLE_WEB_API_TOKEN) {
      console.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      const response = await compressResponse(
        { error: "Server configuration error" },
        request,
      );
      return new NextResponse(response.body, {
        status: 500,
        headers: response.headers,
      });
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      console.error("Unauthorized API access attempt", {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
      const response = await compressResponse(
        { error: "Unauthorized" },
        request,
      );
      return new NextResponse(response.body, {
        status: 401,
        headers: response.headers,
      });
    }

    // 2. Validate request body
    const { discordUserId } = await request.json();
    if (!/^\d{17,19}$/.test(discordUserId)) {
      const response = await compressResponse(
        { error: "Invalid Discord user ID" },
        request,
      );
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }

    // 3. Check user permissions
    const result = await db
      .select({
        isRaidManager: users.isRaidManager,
        userName: users.name,
      })
      .from(users)
      .innerJoin(accounts, eq(users.id, accounts.userId))
      .where(
        and(
          eq(accounts.provider, "discord"),
          eq(accounts.providerAccountId, discordUserId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return await compressResponse(
        {
          hasAccount: false,
          isRaidManager: false,
        },
        request,
      );
    }

    return await compressResponse(
      {
        hasAccount: true,
        isRaidManager: result[0]?.isRaidManager ?? false,
      },
      request,
    );
  } catch (error) {
    console.error("Error checking user permissions:", error);
    const response = await compressResponse(
      { error: "Internal server error" },
      request,
    );
    return new NextResponse(response.body, {
      status: 500,
      headers: response.headers,
    });
  }
}
