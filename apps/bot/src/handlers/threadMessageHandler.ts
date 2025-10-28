import { type Message } from "discord.js";
import { config } from "../config/env.js";
import { checkUserPermissions } from "../services/permissionChecker.js";
import {
  extractRaidIdFromThread,
  parseCharacterNames,
  containsBenchKeyword,
} from "../services/benchParser.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";

// Track processed messages to prevent duplicate processing
const deduplicator = new MessageDeduplicator();

export async function handleThreadMessage(message: Message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in threads
  if (!message.channel.isThread()) return;

  // Only process threads that belong to the target channel
  if (message.channel.parentId !== config.discordLogsChannelId) return;

  // Check if we've already processed this message
  if (deduplicator.has(message.id)) {
    console.log(`⏭️ Thread message ${message.id} already processed, skipping`);
    return;
  }

  // Check if message contains "bench" keyword
  if (!containsBenchKeyword(message.content)) return;

  // Mark this message as processed
  deduplicator.add(message.id);

  console.log(`📝 Bench message detected in thread: ${message.content}`);

  // Check user permissions
  const { hasAccount, isRaidManager } = await checkUserPermissions(
    message.author.id
  );

  if (!hasAccount || !isRaidManager) {
    console.log(`❌ User ${message.author.tag} is not a raid manager`);
    return;
  }

  try {
    // Extract raid ID from thread messages
    const raidId = await extractRaidIdFromThread(message.channel);
    if (!raidId) {
      console.log(`❌ Could not find raid ID in thread`);
      await message.reply(
        "❌ Could not find raid ID in this thread. Make sure a raid URL was posted."
      );
      return;
    }

    // Parse character names from the message
    const characterNames = parseCharacterNames(message.content);
    if (characterNames.length === 0) {
      console.log(`❌ No character names found in message`);
      await message.reply("❌ No character names found in your message.");
      return;
    }

    console.log(`🔍 Found character names: ${characterNames.join(", ")}`);

    // Call the API to update bench
    const response = await fetch(
      `${config.apiBaseUrl}/api/discord/update-bench`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.templeWebApiToken}`,
        },
        body: JSON.stringify({
          discordUserId: message.author.id,
          raidId: raidId,
          characterNames: characterNames,
        }),
      }
    );

    const result = await response.json();

    if (result.success) {
      const {
        raidId,
        raidName,
        matchedCharacters,
        unmatchedNames,
        totalBenchCharacters,
      } = result;

      // Build success message
      let replyMessage = `✅ **Bench updated for ${raidName} (#${raidId})**\n\n`;

      if (matchedCharacters.length > 0) {
        replyMessage += `**Added to bench:**\n`;
        matchedCharacters.forEach((char: { name: string; class: string }) => {
          replyMessage += `• ${char.name} (${char.class})\n`;
        });
        replyMessage += `\n`;
      }

      if (unmatchedNames.length > 0) {
        replyMessage += `**Could not find:**\n`;
        unmatchedNames.forEach((name: string) => {
          replyMessage += `• ${name}\n`;
        });
        replyMessage += `\n`;
      }

      replyMessage += `**Total benched characters:** ${totalBenchCharacters}`;

      await message.reply(replyMessage);
      console.log(`✅ Successfully updated bench for raid ${raidId}`);
    } else {
      console.log(`❌ Failed to update bench: ${result.error}`);
      await message.reply(`❌ Failed to update bench: ${result.error}`);
    }
  } catch (error) {
    console.error("Error handling thread message:", error);
    await message.reply("❌ An error occurred while updating the bench.");
  }
}
