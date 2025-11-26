import { NextResponse } from "next/server";
import { db } from "~/server/db";
import {
  users,
  accounts,
  raidLogs,
  raidLogAttendeeMap,
} from "~/server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { env } from "~/env.js";
import { createCaller } from "~/server/api/root";
import { getDefaultAttendanceWeight } from "~/lib/raid-weights";
import { getBaseUrl } from "~/lib/get-base-url";
import { getEasternDate } from "~/lib/raid-formatting";
import { compressResponse } from "~/lib/compression";

export async function POST(request: Request) {
  try {
    // 1. Verify API auth token
    const authHeader = request.headers.get("authorization");

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
    const { discordUserId, wclUrl, discordMessageId } = await request.json();

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

    if (!wclUrl || !wclUrl.includes("warcraftlogs.com/reports/")) {
      const response = await compressResponse(
        { error: "Invalid WarcraftLogs URL" },
        request,
      );
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
    }

    if (discordMessageId && !/^\d{17,19}$/.test(discordMessageId)) {
      const response = await compressResponse(
        { error: "Invalid Discord message ID" },
        request,
      );
      return new NextResponse(response.body, {
        status: 400,
        headers: response.headers,
      });
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
      return await compressResponse(
        {
          success: false,
          error: "User not found or not linked to Discord account",
        },
        request,
      );
    }

    const user = userResult[0];
    if (!user) {
      return await compressResponse(
        {
          success: false,
          error: "User not found",
        },
        request,
      );
    }

    if (!user.isRaidManager) {
      return await compressResponse(
        {
          success: false,
          error: "User does not have raid manager permissions",
        },
        request,
      );
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
      return await compressResponse(
        {
          success: false,
          error: "Could not extract report ID from WarcraftLogs URL",
        },
        request,
      );
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
        // Use tRPC function to get full raid data
        const raid = await caller.raid.getRaidById(raidLog.raidId);

        if (!raid || !raid.raidId) {
          return await compressResponse(
            {
              success: false,
              error: "Associated raid not found",
            },
            request,
          );
        }

        const baseUrl = getBaseUrl(request);
        const raidUrl = `${baseUrl}/raids/${raid.raidId}`;

        // Get participant count from raidLogAttendeeMap for this specific raid log
        const participantCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(raidLogAttendeeMap)
          .where(eq(raidLogAttendeeMap.raidLogId, reportId));

        const participantCount = participantCountResult[0]?.count || 0;
        const killCount = raid.kills?.length || 0;

        return await compressResponse(
          {
            success: true,
            isNew: false,
            raidId: raid.raidId,
            raidName: raid.name,
            zone: raid.zone,
            date: raid.date,
            participantCount,
            killCount,
            raidUrl,
          },
          request,
        );
      }
    }

    // 6. Import WCL log (fetches from WCL API, imports attendees)
    const raidLog =
      await caller.raidLog.importAndGetRaidLogByRaidLogId(reportId);

    if (!raidLog) {
      return await compressResponse(
        {
          success: false,
          error: "Failed to import WarcraftLogs data",
        },
        request,
      );
    }

    // 7. Create raid entry with imported log
    let raidDate: string;
    if (raidLog.startTimeUTC) {
      raidDate = getEasternDate(raidLog.startTimeUTC);
    } else {
      raidDate = getEasternDate(new Date());
    }
    const raidZone = raidLog.zone ?? "Unknown";
    const raidName = raidLog.name ?? `Raid ${reportId}`;
    const attendanceWeight = getDefaultAttendanceWeight(raidZone);
    const result = await caller.raid.insertRaid({
      name: raidName,
      date: raidDate,
      zone: raidZone,
      attendanceWeight,
      raidLogIds: [reportId],
      bench: {},
    });

    // 8. If raid log already existed, ensure it's properly associated with the new raid
    if (existingRaidLog.length > 0 && result.raid?.raidId) {
      await db
        .update(raidLogs)
        .set({
          raidId: result.raid.raidId,
          ...(discordMessageId && { discordMessageId }),
        })
        .where(eq(raidLogs.raidLogId, reportId));
    } else if (discordMessageId) {
      // If raid log was newly created, update it with the discord message ID
      await db
        .update(raidLogs)
        .set({ discordMessageId })
        .where(eq(raidLogs.raidLogId, reportId));
    }

    // Get participant count from raidLog
    const participantCount = Object.keys(raidLog.participants || {}).length;
    const killCount = raidLog.kills?.length || 0;

    const baseUrl = getBaseUrl(request);
    const raidUrl = `${baseUrl}/raids/${result.raid?.raidId}`;

    return await compressResponse(
      {
        success: true,
        isNew: true,
        raidId: result.raid?.raidId,
        raidName: result.raid?.name,
        zone: raidLog.zone ?? "Unknown",
        date: getEasternDate(raidLog.startTimeUTC),
        participantCount,
        killCount,
        raidUrl,
      },
      request,
    );
  } catch (error) {
    console.error("Error creating raid:", error);
    const response = await compressResponse(
      { success: false, error: "Internal server error" },
      request,
    );
    return new NextResponse(response.body, {
      status: 500,
      headers: response.headers,
    });
  }
}
