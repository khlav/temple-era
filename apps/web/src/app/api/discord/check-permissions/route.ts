import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "~/env.js";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

    // Check if environment variable is set
    if (!env.TEMPLE_WEB_API_TOKEN) {
      console.error("TEMPLE_WEB_API_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${env.TEMPLE_WEB_API_TOKEN}`) {
      console.error("Unauthorized API access attempt", {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate request body
    const { discordUserId } = await request.json();
    if (!/^\d{17,19}$/.test(discordUserId)) {
      return NextResponse.json(
        { error: "Invalid Discord user ID" },
        { status: 400 },
      );
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
      return NextResponse.json({
        hasAccount: false,
        isRaidManager: false,
      });
    }

    return NextResponse.json({
      hasAccount: true,
      isRaidManager: result[0]?.isRaidManager ?? false,
    });
  } catch (error) {
    console.error("Error checking user permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
