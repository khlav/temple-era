import { env } from "~/env.js";

export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    username: string;
    global_name?: string;
  };
  timestamp: string;
  wclUrl?: string;
}

export interface DiscordWarcraftLog {
  messageId: string;
  author: string;
  content: string;
  timestamp: string;
  wclUrl: string;
  raidId?: number;
  raidName?: string;
}

/**
 * Extract Warcraft Logs URLs from Discord message content
 * Normalizes URLs by stripping query params and fragments
 */
export function extractWarcraftLogsUrls(content: string): string[] {
  // Match vanilla and classic warcraftlogs.com URLs
  const wclUrlRegex =
    /https?:\/\/(?:vanilla|classic)\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]{16})(?:[?#].*)?/g;

  const urls: string[] = [];
  let match;

  while ((match = wclUrlRegex.exec(content)) !== null) {
    // Reconstruct clean URL without query params or fragments
    const reportId = match[1];
    const cleanUrl = `https://vanilla.warcraftlogs.com/reports/${reportId}`;
    urls.push(cleanUrl);
  }

  return urls;
}

/**
 * Fetch recent messages from Discord channel
 */
export async function fetchDiscordMessages(): Promise<DiscordMessage[]> {
  const channelId = env.DISCORD_RAID_LOGS_CHANNEL_ID;
  const botToken = env.DISCORD_BOT_TOKEN;

  // Calculate timestamp for 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const afterTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100&after=${afterTimestamp}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Discord API error: ${response.status} ${response.statusText}`,
    );
  }

  const messages: DiscordMessage[] = await response.json();

  // Filter messages that contain Warcraft Logs URLs
  return messages.filter((message) => {
    const wclUrls = extractWarcraftLogsUrls(message.content);
    return wclUrls.length > 0;
  });
}

/**
 * Process Discord messages to extract Warcraft Logs data
 */
export async function getDiscordWarcraftLogs(): Promise<DiscordWarcraftLog[]> {
  const messages = await fetchDiscordMessages();

  const wclLogs: DiscordWarcraftLog[] = [];

  for (const message of messages) {
    const wclUrls = extractWarcraftLogsUrls(message.content);

    for (const wclUrl of wclUrls) {
      wclLogs.push({
        messageId: message.id,
        author: message.author.global_name || message.author.username,
        content: message.content,
        timestamp: message.timestamp,
        wclUrl,
      });
    }
  }

  // Sort by timestamp (most recent first)
  return wclLogs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
