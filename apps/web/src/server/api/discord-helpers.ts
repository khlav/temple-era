import { env } from "~/env.js";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/models/auth-schema";
import { eq, and } from "drizzle-orm";

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
  websiteUser?: {
    id: string;
    name: string;
    image: string;
  };
}

export interface DiscordChannelInfo {
  id: string;
  name: string;
  guildId: string;
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

  // Get recent messages (Discord API returns newest-first by default)
  // We'll filter by date in the application since 'after' parameter expects message ID, not timestamp
  console.log(`Fetching recent messages from channel ${channelId}`);

  const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;

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

  // Debug: Check if message content is accessible (privileged intent issue)
  if (messages.length > 0) {
    const firstMessage = messages[0];
    console.log(
      `First message content length: ${firstMessage?.content.length ?? 0}`,
    );
    console.log(
      `First message content preview: "${firstMessage?.content.substring(0, 100) ?? ""}"`,
    );

    if (firstMessage?.content.length === 0) {
      console.warn(
        "⚠️  Message content is empty - bot may not have MESSAGE_CONTENT privileged intent",
      );
    }
  }

  // Debug: Show message timestamps (Discord API returns newest-first by default)
  if (messages.length > 0) {
    console.log("Message timestamps (newest first):");
    messages.slice(0, 5).forEach((msg, i) => {
      const msgDate = new Date(msg.timestamp);
      console.log(
        `  ${i + 1}. ${msgDate.toISOString()} - ${msg.content.substring(0, 50)}...`,
      );
    });
  }

  // Filter messages that contain Warcraft Logs URLs and are within the last 7 days
  const sevenDaysAgoFilter = new Date();
  sevenDaysAgoFilter.setDate(sevenDaysAgoFilter.getDate() - 7);

  const filteredMessages = messages.filter((message) => {
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
 * Get Discord channel information
 */
export async function getDiscordChannelInfo(): Promise<DiscordChannelInfo> {
  const channelId = env.DISCORD_RAID_LOGS_CHANNEL_ID;
  const botToken = env.DISCORD_BOT_TOKEN;

  const url = `https://discord.com/api/v10/channels/${channelId}`;

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

  const channel = await response.json();

  return {
    id: channel.id,
    name: channel.name,
    guildId: channel.guild_id,
  };
}

/**
 * Process Discord messages to extract Warcraft Logs data
 */
// Helper function to match Discord users to website users
async function getWebsiteUserForDiscordId(discordUserId: string) {
  try {
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
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

    return result[0] || null;
  } catch (error) {
    console.error("Error fetching website user for Discord ID:", error);
    return null;
  }
}

export async function getDiscordWarcraftLogs(): Promise<DiscordWarcraftLog[]> {
  const messages = await fetchDiscordMessages();

  const wclLogs: DiscordWarcraftLog[] = [];

  for (const message of messages) {
    const wclUrls = extractWarcraftLogsUrls(message.content);

    // Try to match Discord user to website user
    const websiteUser = await getWebsiteUserForDiscordId(message.author.id);

    for (const wclUrl of wclUrls) {
      wclLogs.push({
        messageId: message.id,
        author: message.author.global_name || message.author.username,
        content: message.content,
        timestamp: message.timestamp,
        wclUrl,
        websiteUser: websiteUser
          ? {
              id: websiteUser.id,
              name:
                websiteUser.name ||
                message.author.global_name ||
                message.author.username,
              image: websiteUser.image || "",
            }
          : undefined,
      });
    }
  }

  // Sort by timestamp (most recent first) - Discord API already returns in reverse chronological order
  // but we want to ensure it's properly sorted
  return wclLogs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
