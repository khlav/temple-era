import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts, raidLogs } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "~/env.js";
import { createCaller } from "~/server/api/root";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

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
    const { discordUserId, wclUrl } = await request.json();

    if (!/^\d{17,19}$/.test(discordUserId)) {
      return NextResponse.json(
        { error: "Invalid Discord user ID" },
        { status: 400 },
      );
    }

    if (!wclUrl || !wclUrl.includes("warcraftlogs.com/reports/")) {
      return NextResponse.json(
        { error: "Invalid WarcraftLogs URL" },
        { status: 400 },
      );
    }

    // 3. Fetch complete user data for session
    const userResult = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        isRaidManager: users.isRaidManager,
        isAdmin: users.isAdmin,
        characterId: users.characterId,
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

    if (userResult.length === 0) {
      return NextResponse.json({
        success: false,
        error: "User not found or not linked to Discord account",
      });
    }

    const user = userResult[0];
    if (!user) {
      return NextResponse.json({
        success: false,
        error: "User not found",
      });
    }

    if (!user.isRaidManager) {
      return NextResponse.json({
        success: false,
        error: "User does not have raid manager permissions",
      });
    }

    // Create tRPC caller with user session
    const caller = createCaller({
      db,
      headers: new Headers(),
      session: {
        user: {
          id: user.id,
          name: user.name ?? "",
          email: user.email ?? "",
          image: user.image ?? "",
          isRaidManager: user.isRaidManager ?? false,
          isAdmin: user.isAdmin ?? false,
          characterId: user.characterId ?? 0,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      },
    });

    // 4. Extract report ID from WCL URL
    const reportIdMatch = wclUrl.match(/\/reports\/([a-zA-Z0-9]{16})/);
    if (!reportIdMatch) {
      return NextResponse.json({
        success: false,
        error: "Could not extract report ID from WarcraftLogs URL",
      });
    }

    const reportId = reportIdMatch[1];

    // 5. Check if raid log already exists
    const existingRaidLog = await db
      .select({ raidLogId: raidLogs.raidLogId, raidId: raidLogs.raidId })
      .from(raidLogs)
      .where(eq(raidLogs.raidLogId, reportId))
      .limit(1);

    if (existingRaidLog.length > 0) {
      const raidLog = existingRaidLog[0];
      if (!raidLog) {
        return NextResponse.json({
          success: false,
          error: "Error checking existing raid log",
        });
      }
      if (raidLog.raidId) {
        return NextResponse.json({
          success: false,
          error: "Raid log is already associated with a raid",
          raidId: raidLog.raidId,
        });
      }
    }

    // 6. Import WCL log (fetches from WCL API, imports attendees)
    const raidLog = await caller.raidLog.importAndGetRaidLogByRaidLogId({
      raidLogId: reportId,
      forceRaidLogRefresh: false,
    });

    if (!raidLog) {
      return NextResponse.json({
        success: false,
        error: "Failed to import WarcraftLogs data",
      });
    }

    // 7. Create raid entry with imported log
    let raidDate: string;
    if (raidLog.startTimeUTC) {
      raidDate = new Date(raidLog.startTimeUTC).toISOString().split("T")[0]!;
    } else {
      raidDate = new Date().toISOString().split("T")[0]!;
    }
    const raidZone = raidLog.zone ?? "Unknown";
    const raidName = raidLog.name ?? `Raid ${reportId}`;
    const result = await caller.raid.insertRaid({
      name: raidName,
      date: raidDate,
      zone: raidZone,
      attendanceWeight: 1,
      raidLogIds: [reportId],
      bench: {},
    });

    // Get participant count from raidLog
    const participantCount = Object.keys(raidLog.participants || {}).length;
    const killCount = raidLog.kills?.length || 0;

    const raidUrl = `${env.NEXT_PUBLIC_APP_URL}/raids/${result.raid?.raidId}`;

    return NextResponse.json({
      success: true,
      raidId: result.raid?.raidId,
      raidName: result.raid?.name,
      zone: raidLog.zone ?? "Unknown",
      date: new Date(raidLog.startTimeUTC).toISOString().split("T")[0],
      participantCount,
      killCount,
      raidUrl,
    });
  } catch (error) {
    console.error("Error creating raid:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
