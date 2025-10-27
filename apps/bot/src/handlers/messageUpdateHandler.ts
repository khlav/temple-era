import { type Message } from "discord.js";
import { config } from "../config/env.js";
import {
  extractWarcraftLogsUrls,
  extractReportId,
} from "../services/wclDetector.js";
import { checkUserPermissions } from "../services/permissionChecker.js";

// Track recently processed message updates to prevent duplicate processing
const processedUpdates = new Set<string>();
const UPDATE_COOLDOWN_MS = 5000; // 5 seconds cooldown between processing the same message

export async function handleMessageUpdate(
  oldMessage: Message,
  newMessage: Message
) {
  // Create a unique key for this message update
  const updateKey = `${newMessage.id}-${newMessage.editedTimestamp || 0}`;

  // Check if we've already processed this exact update recently
  if (processedUpdates.has(updateKey)) {
    console.log(
      `⏭️ Message update ${updateKey} already processed recently, skipping`
    );
    return;
  }

  // Add to processed set and set up cleanup
  processedUpdates.add(updateKey);
  setTimeout(() => processedUpdates.delete(updateKey), UPDATE_COOLDOWN_MS);

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
        console.log(
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
        console.log("Could not post invalid URL message to thread:", error);
      }
    }
    return;
  }

  // Check user permissions
  const { hasAccount, isRaidManager } = await checkUserPermissions(
    newMessage.author.id
  );

  // Only proceed if user is a raid manager
  if (!hasAccount || !isRaidManager) {
    // Return silently (same as create flow - no permission spam)
    return;
  }

  try {
    console.log(
      `🔄 Attempting to update raid for ${newMessage.author.tag} with new WCL URL: ${firstUrl}`
    );

    const response = await fetch(
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
      console.log(`❌ API endpoint not available yet`);
      return;
    }

    if (result.success) {
      if (result.message) {
        // No change detected (same report ID)
        console.log(`ℹ️ ${result.message}`);
        return;
      }

      console.log(`✅ Raid updated: ${result.raidName} (ID: ${result.raidId})`);

      // Post success message in thread
      if (newMessage.thread) {
        try {
          let message = `✅ Raid updated: **${result.raidName}** | [View Raid](${result.raidUrl})`;
          if (result.nameChanged) {
            message += `\n📝 Raid name changed from previous WCL report`;
          }
          await newMessage.thread.send(message);
        } catch (error) {
          console.log("Could not post success message to thread:", error);
        }
      }

      // Update thread name if raid name changed
      if (result.nameChanged && newMessage.thread) {
        try {
          await newMessage.thread.setName(`Raid: ${result.raidName}`);
        } catch (error) {
          console.log("Could not update thread name:", error);
        }
      }
    } else {
      console.log(`❌ Failed to update raid: ${result.error}`);

      // Post error message in thread
      if (newMessage.thread) {
        try {
          let errorMessage = `❌ Failed to update raid: ${result.error}`;
          if (result.error.includes("import")) {
            errorMessage = `❌ Failed to import WarcraftLogs data: ${result.error}`;
          }
          await newMessage.thread.send(errorMessage);
        } catch (error) {
          console.log("Could not post error message to thread:", error);
        }
      }
    }
  } catch (error) {
    console.error("Error updating raid automatically:", error);

    // Post generic error message in thread
    if (newMessage.thread) {
      try {
        await newMessage.thread.send(
          "❌ An error occurred while updating the raid. Please try again."
        );
      } catch (threadError) {
        console.log("Could not post error message to thread:", threadError);
      }
    }
  }
}
