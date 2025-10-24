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

  if (urls.length > 0) {
    console.log(`Found WCL URLs in message: ${urls.join(", ")}`);
  }

  return urls;
}

/**
 * Fetch recent messages from Discord channel
 */
export async function fetchDiscordMessages(): Promise<DiscordMessage[]> {
  const channelId = env.DISCORD_RAID_LOGS_CHANNEL_ID;
  const botToken = env.DISCORD_BOT_TOKEN;

  // Get messages from the last 7 days
  // Discord API returns messages in oldest-to-newest order, so we need to get recent messages first
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const afterTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

  console.log(
    `Fetching messages after: ${sevenDaysAgo.toISOString()} (timestamp: ${afterTimestamp})`,
  );

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

  console.log(`Discord API returned ${messages.length} messages`);

  // Discord API returns messages in oldest-to-newest order, reverse to get newest first
  const reversedMessages = messages.reverse();

  // Debug: Show message timestamps
  if (reversedMessages.length > 0) {
    console.log("Message timestamps (newest first):");
    reversedMessages.slice(0, 5).forEach((msg, i) => {
      const msgDate = new Date(msg.timestamp);
      console.log(
        `  ${i + 1}. ${msgDate.toISOString()} - ${msg.content.substring(0, 50)}...`,
      );
    });
  }

  // Filter messages that contain Warcraft Logs URLs and are within the last 7 days
  const sevenDaysAgoFilter = new Date();
  sevenDaysAgoFilter.setDate(sevenDaysAgoFilter.getDate() - 7);

  const filteredMessages = reversedMessages.filter((message) => {
    const messageDate = new Date(message.timestamp);
    const hasWclUrls = extractWarcraftLogsUrls(message.content).length > 0;
    const isWithin7Days = messageDate >= sevenDaysAgoFilter;

    console.log(
      `Message from ${messageDate.toISOString()}: hasWcl=${hasWclUrls}, within7Days=${isWithin7Days}`,
    );

    return hasWclUrls && isWithin7Days;
  });

  console.log(`Found ${filteredMessages.length} messages with WCL URLs`);

  return filteredMessages;
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

  // Sort by timestamp (most recent first) - Discord API already returns in reverse chronological order
  // but we want to ensure it's properly sorted
  return wclLogs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
