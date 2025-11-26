import { type Message } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  extractWarcraftLogsUrls,
  extractReportId,
} from "../services/wclDetector.js";
import { checkUserPermissions } from "../services/permissionChecker.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";
import { compressedFetch } from "../utils/compressedFetch.js";

// Track recently processed message updates to prevent duplicate processing
const deduplicator = new MessageDeduplicator();

export async function handleMessageUpdate(
  oldMessage: Message,
  newMessage: Message
) {
  // Skip if this is not actually an edit (editedTimestamp is null or 0)
  if (!newMessage.editedTimestamp || newMessage.editedTimestamp === 0) {
    logger.debug(
      `Skipping message update - not an actual edit (timestamp: ${newMessage.editedTimestamp})`
    );
    return;
  }

  // Create a unique key for this message update
  const updateKey = `${newMessage.id}-${newMessage.editedTimestamp}`;

  // Check if we've already processed this exact update recently
  if (deduplicator.has(updateKey)) {
    logger.debug(
      `Message update ${updateKey} already processed recently, skipping`
    );
    return;
  }

  // Add to processed set with automatic cleanup
  deduplicator.add(updateKey);

  // Ignore bot messages
  if (newMessage.author.bot) return;

  // Only process messages in the target channel
  if (newMessage.channelId !== config.discordLogsChannelId) return;

  // Ignore thread messages (only process main channel messages)
  if (newMessage.channel.isThread()) return;

  // Check if edit is within 15 minutes of original message
  const fifteenMinutesInMs = 15 * 60 * 1000;
  const timeSinceCreation = Date.now() - newMessage.createdTimestamp;

  if (timeSinceCreation > fifteenMinutesInMs) {
    // Post informational message in thread if it exists
    if (newMessage.thread) {
      try {
        await newMessage.thread.send(
          "⏰ Raid edits are only allowed within 15 minutes of the original message."
        );
      } catch (error) {
        logger.error(
          "Could not post 15-minute window message to thread:",
          error
        );
      }
    }
    return;
  }

  // Extract new WCL URL from edited message
  const wclUrls = extractWarcraftLogsUrls(newMessage.content);
  if (wclUrls.length === 0) {
    // User may have intentionally removed the WCL URL, return silently
    return;
  }

  // Get first WCL URL and extract report ID
  const firstUrl = wclUrls[0];
  const newReportId = extractReportId(firstUrl);
  if (!newReportId) {
    // Invalid WCL URL, post error message in thread
    if (newMessage.thread) {
      try {
        await newMessage.thread.send(
          "❌ Invalid WarcraftLogs URL. Please check the link and try again."
        );
      } catch (error) {
        logger.error("Could not post invalid URL message to thread:", error);
      }
    }
    return;
  }

  // Check user permissions
  const permissionResult = await checkUserPermissions(newMessage.author.id);

  if (!permissionResult.success) {
    logger.error("Failed to check permissions - API unavailable", {
      user: newMessage.author.tag,
      userId: newMessage.author.id,
      error: permissionResult.error,
      statusCode: permissionResult.statusCode,
      messageId: newMessage.id,
    });
    return;
  }

  // Only proceed if user is a raid manager
  if (!permissionResult.hasAccount || !permissionResult.isRaidManager) {
    // Return silently (same as create flow - no permission spam)
    return;
  }

  try {
    logger.info("Attempting to update raid", {
      user: newMessage.author.tag,
      userId: newMessage.author.id,
      newWclUrl: firstUrl,
      messageId: newMessage.id,
      oldWclUrl: extractWarcraftLogsUrls(oldMessage.content)[0] || "none",
    });

    const response = await compressedFetch(
      `${config.apiBaseUrl}/api/discord/update-raid`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.templeWebApiToken}`,
        },
        body: JSON.stringify({
          discordUserId: newMessage.author.id,
          newWclUrl: firstUrl,
          discordMessageId: newMessage.id,
        }),
      }
    );

    let result;
    try {
      result = await response.json();
    } catch {
      logger.warn("API endpoint not available yet", {
        endpoint: "/api/discord/update-raid",
        user: newMessage.author.tag,
        userId: newMessage.author.id,
        statusCode: response.status,
        messageId: newMessage.id,
      });
      return;
    }

    if (result.success) {
      if (result.message) {
        // No change detected (same report ID)
        logger.info("No change detected in raid update", {
          message: result.message,
          user: newMessage.author.tag,
          userId: newMessage.author.id,
          messageId: newMessage.id,
        });
        return;
      }

      logger.info("Raid updated successfully", {
        raidName: result.raidName,
        raidId: result.raidId,
        nameChanged: result.nameChanged,
        user: newMessage.author.tag,
        userId: newMessage.author.id,
        messageId: newMessage.id,
      });

      // Post success message in thread
      if (newMessage.thread) {
        try {
          let message = `✅ Raid updated: **${result.raidName}** | [View Raid](${result.raidUrl})`;
          if (result.nameChanged) {
            message += `\n📝 Raid name changed from previous WCL report`;
          }
          await newMessage.thread.send(message);
        } catch (error) {
          logger.error("Could not post success message to thread", {
            error: error instanceof Error ? error.message : String(error),
            threadId: newMessage.thread.id,
            raidId: result.raidId,
            user: newMessage.author.tag,
          });
        }
      }

      // Update thread name if raid name changed
      if (result.nameChanged && newMessage.thread) {
        try {
          await newMessage.thread.setName(`Raid: ${result.raidName}`);
          logger.info("Updated thread name", {
            threadId: newMessage.thread.id,
            oldName: newMessage.thread.name,
            newName: `Raid: ${result.raidName}`,
            raidId: result.raidId,
          });
        } catch (error) {
          logger.error("Could not update thread name", {
            error: error instanceof Error ? error.message : String(error),
            threadId: newMessage.thread.id,
            raidId: result.raidId,
            user: newMessage.author.tag,
          });
        }
      }
    } else {
      logger.error("Failed to update raid", {
        error: result.error,
        user: newMessage.author.tag,
        userId: newMessage.author.id,
        messageId: newMessage.id,
        newWclUrl: firstUrl,
      });

      // Post error message in thread
      if (newMessage.thread) {
        try {
          let errorMessage = `❌ Failed to update raid: ${result.error}`;
          if (result.error.includes("import")) {
            errorMessage = `❌ Failed to import WarcraftLogs data: ${result.error}`;
          }
          await newMessage.thread.send(errorMessage);
        } catch (error) {
          logger.error("Could not post error message to thread", {
            error: error instanceof Error ? error.message : String(error),
            threadId: newMessage.thread.id,
            user: newMessage.author.tag,
            messageId: newMessage.id,
          });
        }
      }
    }
  } catch (error) {
    logger.error("Error updating raid automatically", {
      error: error instanceof Error ? error.message : String(error),
      user: newMessage.author.tag,
      userId: newMessage.author.id,
      messageId: newMessage.id,
      newWclUrl: firstUrl,
    });

    // Post generic error message in thread
    if (newMessage.thread) {
      try {
        await newMessage.thread.send(
          "❌ An error occurred while updating the raid. Please try again."
        );
      } catch (threadError) {
        logger.error("Could not post error message to thread", {
          error:
            threadError instanceof Error
              ? threadError.message
              : String(threadError),
          threadId: newMessage.thread.id,
          user: newMessage.author.tag,
          messageId: newMessage.id,
        });
      }
    }
  }
}
