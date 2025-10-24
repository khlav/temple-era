import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { raidLogs, raids } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import {
  getDiscordWarcraftLogs,
  getDiscordChannelInfo,
} from "../discord-helpers";

export const discordRouter = createTRPCRouter({
  getRecentWarcraftLogs: publicProcedure.query(async () => {
    try {
      const discordLogs = await getDiscordWarcraftLogs();

      // For each WCL URL, check if it's already imported
      const logsWithStatus = await Promise.all(
        discordLogs.map(async (log) => {
          // Extract report ID from URL
          const reportIdMatch = log.wclUrl.match(
            /\/reports\/([a-zA-Z0-9]{16})/,
          );
          if (!reportIdMatch) {
            return { ...log, raidId: undefined, raidName: undefined };
          }

          const reportId = reportIdMatch[1];

          // Check if this report ID exists in raidLogs table
          const existingRaidLog = await db
            .select({
              raidLogId: raidLogs.raidLogId,
              raidId: raidLogs.raidId,
              name: raids.name,
            })
            .from(raidLogs)
            .leftJoin(raids, eq(raidLogs.raidId, raids.raidId))
            .where(eq(raidLogs.raidLogId, reportId))
            .limit(1);

          if (existingRaidLog.length > 0) {
            const raidLog = existingRaidLog[0];
            return {
              ...log,
              raidId: raidLog.raidId,
              raidName: raidLog.name,
            };
          }

          return { ...log, raidId: undefined, raidName: undefined };
        }),
      );

      return logsWithStatus;
    } catch (error) {
      console.error("Error fetching Discord Warcraft Logs:", error);
      throw new Error("Failed to fetch Discord messages");
    }
  }),

  getChannelInfo: publicProcedure.query(async () => {
    try {
      const channelInfo = await getDiscordChannelInfo();
      return channelInfo;
    } catch (error) {
      console.error("Error fetching Discord channel info:", error);
      throw new Error("Failed to fetch Discord channel info");
    }
  }),
});
