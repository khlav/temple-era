import { type ThreadChannel } from "discord.js";

/**
 * Extract raid ID from thread messages by parsing raid URLs
 * @param thread The Discord thread channel
 * @returns The raid ID if found, null otherwise
 */
export async function extractRaidIdFromThread(
  thread: ThreadChannel
): Promise<number | null> {
  try {
    // Fetch up to 50 messages to find raid URL
    const messages = await thread.messages.fetch({ limit: 50 });

    // Look for raid URLs in the messages
    for (const [, message] of messages) {
      const content = message.content;

      // Look for raid URLs like /raids/123
      const raidUrlMatch = content.match(/\/raids\/(\d+)/);
      if (raidUrlMatch) {
        return parseInt(raidUrlMatch[1], 10);
      }
    }

    return null;
  } catch (error) {
    console.error("Error extracting raid ID from thread:", error);
    return null;
  }
}

/**
 * Parse character names from message content
 * @param messageContent The message content to parse
 * @returns Array of character names (excluding "bench" keyword)
 */
export function parseCharacterNames(messageContent: string): string[] {
  // Handle bench: pattern by splitting on it first
  let contentToParse = messageContent;
  if (messageContent.toLowerCase().includes("bench:")) {
    const parts = messageContent.split(/bench:/i);
    if (parts.length > 1) {
      contentToParse = parts.slice(1).join(" "); // Take everything after "bench:"
    }
  }

  // Split by comma, space, or newline
  const words = contentToParse
    .split(/[,\s\n]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/^[,.:;!?]+|[,.:;!?]+$/g, "")) // Strip punctuation from start/end
    .filter((word) => word.length > 0); // Remove any empty strings after punctuation stripping

  // Filter out only the first occurrence of "bench" (case-insensitive)
  // This allows "bench" to appear as a character name if it appears multiple times
  let foundBench = false;
  const characterNames = words.filter((word) => {
    const isBench = word.toLowerCase() === "bench";
    if (isBench && !foundBench) {
      foundBench = true;
      return false; // Filter out the first "bench"
    }
    return true; // Keep all other words, including subsequent "bench" words
  });

  return characterNames;
}

/**
 * Check if message contains the "bench" keyword
 * @param messageContent The message content to check
 * @returns True if message contains "bench" keyword
 */
export function containsBenchKeyword(messageContent: string): boolean {
  const trimmedContent = messageContent.trim().toLowerCase();
  // Check if message starts with "bench" followed by whitespace or punctuation
  return (
    trimmedContent.startsWith("bench") &&
    (trimmedContent.length === 5 || /^bench[\s:;,.]/.test(trimmedContent))
  );
}
