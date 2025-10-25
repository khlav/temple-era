import { ThreadChannel } from 'discord.js';

/**
 * Extract raid ID from thread messages by parsing raid URLs
 * @param thread The Discord thread channel
 * @returns The raid ID if found, null otherwise
 */
export async function extractRaidIdFromThread(thread: ThreadChannel): Promise<number | null> {
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
    console.error('Error extracting raid ID from thread:', error);
    return null;
  }
}

/**
 * Parse character names from message content
 * @param messageContent The message content to parse
 * @returns Array of character names (excluding "bench" keyword)
 */
export function parseCharacterNames(messageContent: string): string[] {
  // Split by comma, space, or newline
  const words = messageContent
    .split(/[,\s\n]+/)
    .map(word => word.trim())
    .filter(word => word.length > 0);
  
  // Filter out only the first occurrence of "bench" (case-insensitive)
  // This allows "bench" to appear as a character name if it appears multiple times
  let foundBench = false;
  const characterNames = words.filter(word => {
    const isBench = word.toLowerCase() === 'bench';
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
  return messageContent.toLowerCase().includes('bench');
}
