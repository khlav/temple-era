import { type Message } from "discord.js";
import { CreateRaidResponseSchema, type CreateRaidRequest } from "@temple-era/contracts";
import { extractReportId, extractWarcraftLogsUrls } from "@temple-era/wcl";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { checkUserPermissions } from "../services/permissionChecker.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";

// Track processed messages to prevent duplicate processing
const deduplicator = new MessageDeduplicator();

export async function handleMessage(message: Message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in the target channel
  if (message.channelId !== config.discordLogsChannelId) return;

  // Check if we've already processed this message
  if (deduplicator.has(message.id)) {
    logger.debug(`Message ${message.id} already processed, skipping`);
    return;
  }

  // Log messages in the target channel
  logger.debug(`Message from ${message.author.tag}: ${message.content}`);

  // Extract WCL URLs
  const wclUrls = extractWarcraftLogsUrls(message.content);
  if (wclUrls.length === 0) return;

  // Get first WCL URL and extract report ID
  const firstUrl = wclUrls[0];
  const reportId = extractReportId(firstUrl);
  if (!reportId) return;

  // Mark this message as processed
  deduplicator.add(message.id);

  // Check user permissions
  const permissionResult = await checkUserPermissions(message.author.id);

  if (!permissionResult.success) {
    logger.error("Failed to check permissions - API unavailable", {
      user: message.author.tag,
      userId: message.author.id,
      error: permissionResult.error,
      statusCode: permissionResult.statusCode,
    });
    return;
  }

  if (!permissionResult.hasAccount || !permissionResult.canManageRaidLogs) {
    logger.warn(`User ${message.author.tag} cannot manage raid logs`);
    return;
  }

  try {
    logger.info("Attempting to create raid", {
      user: message.author.tag,
      userId: message.author.id,
      wclUrl: firstUrl,
      messageId: message.id,
    });

    const body: CreateRaidRequest = {
      discordUserId: message.author.id,
      wclUrl: firstUrl,
      discordMessageId: message.id,
    };

    const response = await fetch(`${config.apiBaseUrl}/api/discord/create-raid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.templeWebApiToken}`,
      },
      body: JSON.stringify(body),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      logger.warn("API endpoint not available yet", {
        endpoint: "/api/discord/create-raid",
        user: message.author.tag,
        userId: message.author.id,
        statusCode: response.status,
      });
      return;
    }

    const parsed = CreateRaidResponseSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error("Unexpected response shape from create-raid", {
        endpoint: "/api/discord/create-raid",
        user: message.author.tag,
        userId: message.author.id,
        statusCode: response.status,
        error: parsed.error.message,
      });
      return;
    }
    const result = parsed.data;

    if ("success" in result && result.success) {
      const raidStatus = result.isNew ? "created" : "found existing";
      logger.info("Raid operation successful", {
        status: raidStatus,
        raidName: result.raidName,
        raidId: result.raidId,
        user: message.author.tag,
        userId: message.author.id,
      });

      // Check if thread already exists for this message
      if (message.thread) {
        logger.info("Thread already exists, posting raid link", {
          threadId: message.thread.id,
          raidId: result.raidId,
        });
        await message.thread.send(result.raidUrl);
      } else {
        // Create thread with raid name
        const thread = await message.startThread({
          name: `Raid: ${result.raidName}`,
          autoArchiveDuration: 60, // 1 hour (valid Discord enum value)
        });

        logger.info("Created new thread for raid", {
          threadId: thread.id,
          threadName: thread.name,
          raidId: result.raidId,
        });

        // Post simple raid link in the thread
        await thread.send(result.raidUrl);
      }
    } else {
      logger.error("Failed to create raid", {
        error: result.error,
        user: message.author.tag,
        userId: message.author.id,
        wclUrl: firstUrl,
      });
    }
  } catch (error) {
    logger.error("Error creating raid automatically", {
      error: error instanceof Error ? error.message : String(error),
      user: message.author.tag,
      userId: message.author.id,
      wclUrl: firstUrl,
    });
  }
}
