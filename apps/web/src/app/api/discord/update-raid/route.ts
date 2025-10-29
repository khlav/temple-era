import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { users, accounts, raidLogs } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "~/env.js";
import { createCaller } from "~/server/api/root";
import { getBaseUrl } from "~/lib/get-base-url";
import { getEasternDate } from "~/lib/raid-formatting";

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
    const { discordUserId, newWclUrl, discordMessageId } = await request.json();

    if (!/^\d{17,19}$/.test(discordUserId)) {
      return NextResponse.json(
        { error: "Invalid Discord user ID" },
        { status: 400 },
      );
    }

    if (!newWclUrl || !newWclUrl.includes("warcraftlogs.com/reports/")) {
      return NextResponse.json(
        { error: "Invalid WarcraftLogs URL" },
        { status: 400 },
      );
    }

    if (!discordMessageId || !/^\d{17,19}$/.test(discordMessageId)) {
      return NextResponse.json(
        { error: "Invalid Discord message ID" },
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

    // 4. Find the raid log associated with the Discord message
    const existingRaidLog = await db
      .select({
        raidLogId: raidLogs.raidLogId,
        raidId: raidLogs.raidId,
        name: raidLogs.name,
        zone: raidLogs.zone,
        startTimeUTC: raidLogs.startTimeUTC,
        createdById: raidLogs.createdById,
      })
      .from(raidLogs)
      .where(eq(raidLogs.discordMessageId, discordMessageId))
      .limit(1);

    if (existingRaidLog.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No raid found for this Discord message",
      });
    }

    const oldRaidLog = existingRaidLog[0];
    if (!oldRaidLog) {
      return NextResponse.json({
        success: false,
        error: "Raid log not found",
      });
    }

    if (!oldRaidLog.raidId) {
      return NextResponse.json({
        success: false,
        error: "Raid log is not associated with a raid",
      });
    }

    // 5. Verify ownership - only the original creator can update the raid
    if (oldRaidLog.createdById !== user.id) {
      return NextResponse.json({
        success: false,
        error: "You can only update raids you originally created",
      });
    }

    // 6. Extract new report ID from WCL URL
    const reportIdMatch = newWclUrl.match(/\/reports\/([a-zA-Z0-9]{16})/);
    if (!reportIdMatch) {
      return NextResponse.json({
        success: false,
        error: "Could not extract report ID from WarcraftLogs URL",
      });
    }

    const newReportId = reportIdMatch[1];

    // 7. Check if it's the same report ID (no change needed)
    if (oldRaidLog.raidLogId === newReportId) {
      return NextResponse.json({
        success: true,
        isNew: false,
        message: "No change detected - same WarcraftLogs report",
        raidId: oldRaidLog.raidId,
      });
    }

    // 8. Check if the new WCL report is already being used by another raid
    const existingRaidLogWithNewId = await db
      .select({
        raidLogId: raidLogs.raidLogId,
        raidId: raidLogs.raidId,
        createdById: raidLogs.createdById,
      })
      .from(raidLogs)
      .where(eq(raidLogs.raidLogId, newReportId))
      .limit(1);

    if (existingRaidLogWithNewId.length > 0) {
      const existingLog = existingRaidLogWithNewId[0];
      if (
        existingLog &&
        existingLog.raidId &&
        existingLog.raidId !== oldRaidLog.raidId
      ) {
        return NextResponse.json({
          success: false,
          error:
            "This WarcraftLogs report is already being used by another raid",
        });
      }
    }

    // 9. Import new WCL log
    const newRaidLog =
      await caller.raidLog.importAndGetRaidLogByRaidLogId(newReportId);

    if (!newRaidLog) {
      return NextResponse.json({
        success: false,
        error: "Failed to import new WarcraftLogs data",
      });
    }

    // 10. Get current raid data
    const currentRaid = await caller.raid.getRaidById(oldRaidLog.raidId);
    if (!currentRaid || !currentRaid.raidId) {
      return NextResponse.json({
        success: false,
        error: "Associated raid not found",
      });
    }

    // 11. Prepare new raid data
    let newRaidDate: string;
    if (newRaidLog.startTimeUTC) {
      newRaidDate = getEasternDate(newRaidLog.startTimeUTC);
    } else {
      newRaidDate = getEasternDate(new Date());
    }

    const newRaidName = newRaidLog.name ?? `Raid ${newReportId}`;
    const newRaidZone = newRaidLog.zone ?? "Unknown";

    // 12. First, remove the old raid log from the raid (set raidId to null)
    await db
      .update(raidLogs)
      .set({ raidId: null })
      .where(eq(raidLogs.raidLogId, oldRaidLog.raidLogId));

    // 13. Update the raid using existing tRPC function (this will associate the new raid log)
    await caller.raid.updateRaid({
      raidId: oldRaidLog.raidId,
      name: newRaidName,
      date: newRaidDate,
      zone: newRaidZone,
      attendanceWeight: currentRaid.attendanceWeight,
      raidLogIds: [newReportId],
      bench: currentRaid.bench,
    });

    // 14. Update the new raid log with the Discord message ID
    await db
      .update(raidLogs)
      .set({ discordMessageId })
      .where(eq(raidLogs.raidLogId, newReportId));

    // 15. Remove the Discord message ID from the old raid log
    await db
      .update(raidLogs)
      .set({ discordMessageId: null })
      .where(eq(raidLogs.raidLogId, oldRaidLog.raidLogId));

    const baseUrl = getBaseUrl(request);
    const raidUrl = `${baseUrl}/raids/${oldRaidLog.raidId}`;

    return NextResponse.json({
      success: true,
      isNew: false,
      raidId: oldRaidLog.raidId,
      raidName: newRaidName,
      zone: newRaidZone,
      date: newRaidDate,
      participantCount: Object.keys(newRaidLog.participants || {}).length,
      killCount: newRaidLog.kills?.length || 0,
      raidUrl,
      nameChanged: newRaidName !== oldRaidLog.name,
    });
  } catch (error) {
    console.error("Error updating raid:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
