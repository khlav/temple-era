import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts, raids, raidLogs } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "~/env.js";

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

    // 3. Check user permissions
    const userResult = await db
      .select({
        userId: users.id,
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

    // 6. For now, create a basic raid without WCL data
    // TODO: Implement proper WCL data fetching
    const wclData = {
      name: `Raid ${reportId}`,
      zone: "Unknown",
      startTimeUTC: new Date(),
      participants: {},
      kills: [],
    };

    // 7. Create raid entry
    const raidDate = new Date(wclData.startTimeUTC);
    const raidInsertResult = await db
      .insert(raids)
      .values({
        name: wclData.name || "Unknown Raid",
        date: raidDate.toISOString().split("T")[0],
        zone: wclData.zone || "Unknown",
        attendanceWeight: 1, // Default weight
        createdById: user.userId,
        updatedById: user.userId,
      } as any)
      .returning({ raidId: raids.raidId, name: raids.name });

    const insertedRaid = raidInsertResult[0];
    if (!insertedRaid) {
      return NextResponse.json({
        success: false,
        error: "Failed to create raid entry",
      });
    }

    // 8. Import raid log and associate with raid
    // Note: This would need to be implemented with proper imports
    // For now, we'll skip the complex raid log association

    // 9. Get raid details for the response
    const raidDetails = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        zone: raids.zone,
        date: raids.date,
      })
      .from(raids)
      .where(eq(raids.raidId, insertedRaid.raidId))
      .limit(1);

    // Get participant count from WCL data
    const participantCount = Object.keys(wclData.participants || {}).length;

    // Get kill count from WCL data
    const killCount = wclData.kills?.length || 0;

    const raidUrl = `${env.NEXT_PUBLIC_APP_URL}/raids/${insertedRaid.raidId}`;

    return NextResponse.json({
      success: true,
      raidId: insertedRaid.raidId,
      raidName: insertedRaid.name,
      zone: wclData.zone || "Unknown",
      date: raidDetails[0]?.date,
      participantCount: participantCount,
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
