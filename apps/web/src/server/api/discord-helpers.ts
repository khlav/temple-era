import { env } from "~/env.js";
import { db } from "~/server/db";
import { users, accounts } from "~/server/db/models/auth-schema";
import { eq, and } from "drizzle-orm";

export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    global_name?: string;
  };
  timestamp: string;
  wclUrl?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    fields?: Array<{
      name: string;
      value: string;
    }>;
  }>;
  components?: Array<{
    type: number;
    components?: Array<{
      type: number;
      label?: string;
      url?: string;
    }>;
  }>;
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

export interface DiscordSoftResLink {
  messageId: string;
  softResUrl: string;
  softResRaidId: string;
  timestamp: string;
  channelId: string;
  channelName: string;
  guildId: string;
  raidInstance?: string | null;
  raidDate?: string;
  embedTitle?: string; // Discord embed title (e.g., "Saturday AQ40 @9PM")
  raidDateTime?: string; // ISO timestamp extracted from Discord timestamp
}

/**
 * Extended DiscordMessage interface with channel context
 * Used when fetching messages from multiple channels
 */
export interface DiscordMessageWithChannel extends DiscordMessage {
  channelId: string;
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

/**
 * Parse raid title from Discord custom emoji blocks in description
 * Format: <:LETTER:ID> where LETTER is the character, <:empty:ID> is a space
 * Example: "**<:S:123> <:A:456> <:T:789>**" becomes "SAT"
 */
function parseEmojiTitle(description: string): string | undefined {
  // Get first line (title is usually wrapped in ** on first line, before \n\n)
  const firstLine = description.split("\n\n")[0];
  if (!firstLine) return undefined;

  // Remove markdown formatting (**, __, etc.)
  const cleanLine = firstLine.replace(/\*\*/g, "").replace(/__/g, "");

  // Match custom emoji pattern: <:NAME:ID>
  const emojiRegex = /<:([^:]+):\d+>/g;
  const chars: string[] = [];
  let match;

  while ((match = emojiRegex.exec(cleanLine)) !== null) {
    const emojiName = match[1];
    if (emojiName === "empty") {
      chars.push(" ");
    } else if (emojiName) {
      // Take the first character of the emoji name
      chars.push(emojiName.charAt(0));
    }
  }

  const result = chars.join("").trim();
  // Only return if we got a reasonable title (at least 3 chars)
  return result.length >= 3 ? result : undefined;
}

/**
 * Extract Discord timestamp from embed fields
 * Format: <t:UNIX_TIMESTAMP:FORMAT> where FORMAT is D/t/R/etc.
 * Returns ISO date string
 */
function extractDiscordTimestamp(message: DiscordMessage): string | undefined {
  if (!message.embeds || message.embeds.length === 0) return undefined;

  // Discord timestamp regex: <t:UNIX_TIMESTAMP:FORMAT>
  const timestampRegex = /<t:(\d+):[DtRfFT]>/;

  for (const embed of message.embeds) {
    if (embed.fields) {
      for (const field of embed.fields) {
        // Check field value for timestamp
        const match = timestampRegex.exec(field.value);
        if (match?.[1]) {
          const unixTimestamp = parseInt(match[1], 10);
          const date = new Date(unixTimestamp * 1000); // Convert to milliseconds
          return date.toISOString();
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract unique SoftRes raid IDs from text
 * Returns array of raid IDs found in the text
 */
function extractSoftResRaidIds(text: string): string[] {
  const softresUrlRegex = /https?:\/\/softres\.it\/raid\/([a-zA-Z0-9]+)/gi;
  const raidIds: string[] = [];
  let match;

  while ((match = softresUrlRegex.exec(text)) !== null) {
    const raidId = match[1];
    if (raidId) {
      raidIds.push(raidId);
    }
  }

  return raidIds;
}

/**
 * Extract SoftRes URLs from Discord message (content, embeds, and components)
 * Returns array of objects with raid IDs, optional embed titles, and raid date/time
 */
export function extractSoftResUrls(
  message: DiscordMessage,
): Array<{ raidId: string; embedTitle?: string; raidDateTime?: string }> {
  const results: Array<{
    raidId: string;
    embedTitle?: string;
    raidDateTime?: string;
  }> = [];
  const seenIds = new Set<string>();

  // Extract raid date/time once for the whole message
  const raidDateTime = extractDiscordTimestamp(message);

  // Helper to add unique raid IDs to results
  const addRaidIds = (raidIds: string[], embedTitle?: string) => {
    for (const raidId of raidIds) {
      if (!seenIds.has(raidId)) {
        seenIds.add(raidId);
        results.push({ raidId, embedTitle, raidDateTime });
      }
    }
  };

  // 1. Check message content
  addRaidIds(extractSoftResRaidIds(message.content));

  // 2. Check embeds
  if (message.embeds && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      // Try to parse title from emoji blocks in description first
      let embedTitle = embed.title || undefined;
      if (!embedTitle && embed.description) {
        const parsedTitle = parseEmojiTitle(embed.description);
        if (parsedTitle) {
          embedTitle = parsedTitle;
        }
      }

      if (embed.url) addRaidIds(extractSoftResRaidIds(embed.url), embedTitle);
      if (embed.title)
        addRaidIds(extractSoftResRaidIds(embed.title), embedTitle);
      if (embed.description)
        addRaidIds(extractSoftResRaidIds(embed.description), embedTitle);
      if (embed.fields) {
        for (const field of embed.fields) {
          addRaidIds(extractSoftResRaidIds(field.name), embedTitle);
          addRaidIds(extractSoftResRaidIds(field.value), embedTitle);
        }
      }
    }
  }

  // 3. Check components (buttons)
  if (message.components && message.components.length > 0) {
    for (const row of message.components) {
      if (row.components) {
        for (const component of row.components) {
          if (component.url) {
            addRaidIds(extractSoftResRaidIds(component.url));
          }
          if (component.label) {
            addRaidIds(extractSoftResRaidIds(component.label));
          }
        }
      }
    }
  }

  return results;
}

/**
 * Fetch recent messages from multiple Discord channels
 */
export async function fetchDiscordMessagesMultiChannel(
  channelIds: string[],
): Promise<DiscordMessageWithChannel[]> {
  const botToken = env.DISCORD_BOT_TOKEN;
  const allMessages: DiscordMessageWithChannel[] = [];

  // Fetch messages from each channel concurrently
  const fetchPromises = channelIds.map(async (channelId) => {
    try {
      const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          `[SoftRes Fetch] Discord API error for channel ${channelId}: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const messages: DiscordMessage[] = await response.json();
      console.log(
        `[SoftRes Fetch] Discord API returned ${messages.length} messages from channel ${channelId}`,
      );

      // Add channel ID to each message for tracking
      return messages.map((msg) => ({
        ...msg,
        channelId,
      })) as DiscordMessageWithChannel[];
    } catch (error) {
      console.error(
        `[SoftRes Fetch] Failed to fetch messages from channel ${channelId}:`,
        error,
      );
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach((messages) => allMessages.push(...messages));

  return allMessages;
}

/**
 * Get information for multiple Discord channels
 */
export async function getMultipleChannelInfo(
  channelIds: string[],
): Promise<Map<string, DiscordChannelInfo>> {
  const botToken = env.DISCORD_BOT_TOKEN;
  const channelInfoMap = new Map<string, DiscordChannelInfo>();

  // Fetch channel info concurrently
  const fetchPromises = channelIds.map(async (channelId) => {
    try {
      const url = `https://discord.com/api/v10/channels/${channelId}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          `Discord API error for channel ${channelId}: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const channel = await response.json();
      return {
        id: channel.id,
        name: channel.name,
        guildId: channel.guild_id,
      } as DiscordChannelInfo;
    } catch (error) {
      console.error(`Failed to fetch channel info for ${channelId}:`, error);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach((info) => {
    if (info) {
      channelInfoMap.set(info.id, info);
    }
  });

  return channelInfoMap;
}

/**
 * Check if Discord message components contain a "Bench" button
 * Signup messages from raid-helper bot have this button
 */
function hasBenchButton(message: DiscordMessageWithChannel): boolean {
  if (!message.components || message.components.length === 0) return false;

  for (const row of message.components) {
    if (row.components) {
      for (const component of row.components) {
        if (
          component.label &&
          component.label.toLowerCase().includes("bench")
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Get SoftRes links from Discord channels (raid-helper bot only)
 * Filters to messages from last 7 days
 */
export async function getDiscordSoftResLinks(): Promise<DiscordSoftResLink[]> {
  const channelIds = env.DISCORD_RAID_SR_CHANNEL_IDS;
  console.log(
    `[SoftRes] Scanning ${channelIds.length} channels for SoftRes links`,
  );

  // Fetch messages from all channels
  const messages = await fetchDiscordMessagesMultiChannel(channelIds);
  console.log(`[SoftRes] Fetched ${messages.length} total messages`);

  // Get channel info for all channels
  const channelInfoMap = await getMultipleChannelInfo(channelIds);

  // Filter messages from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Raid-helper bot user ID
  const RAID_HELPER_BOT_ID = env.DISCORD_RAID_HELPER_BOT_ID;

  // Filter to raid-helper bot messages with SoftRes URLs from last 7 days
  // Only include signup messages (which have a "Bench" button component)
  const filteredMessages = messages.filter((message) => {
    const messageDate = new Date(message.timestamp);
    const isRaidHelperBot = message.author.id === RAID_HELPER_BOT_ID;
    const hasSoftResUrls = extractSoftResUrls(message).length > 0;
    const isWithin7Days = messageDate >= sevenDaysAgo;
    const isSignupMessage = hasBenchButton(message);

    return (
      isRaidHelperBot && hasSoftResUrls && isSignupMessage && isWithin7Days
    );
  });

  // Extract SoftRes links with context
  const softResLinks: DiscordSoftResLink[] = [];

  for (const message of filteredMessages) {
    const extractedData = extractSoftResUrls(message);
    const channelInfo = channelInfoMap.get(message.channelId);

    if (!channelInfo) {
      console.error(
        `[SoftRes] No channel info found for channel ${message.channelId}`,
      );
      continue;
    }

    for (const { raidId, embedTitle, raidDateTime } of extractedData) {
      softResLinks.push({
        messageId: message.id,
        softResUrl: `https://softres.it/raid/${raidId}`,
        softResRaidId: raidId,
        timestamp: message.timestamp,
        channelId: channelInfo.id,
        channelName: channelInfo.name,
        guildId: channelInfo.guildId,
        embedTitle,
        raidDateTime,
      });
    }
  }

  // Deduplicate by softResRaidId (keep most recent message)
  const uniqueLinks = new Map<string, DiscordSoftResLink>();
  for (const link of softResLinks) {
    const existing = uniqueLinks.get(link.softResRaidId);
    if (!existing || new Date(link.timestamp) > new Date(existing.timestamp)) {
      uniqueLinks.set(link.softResRaidId, link);
    }
  }

  // Sort by raid date/time (ascending - earliest first)
  // Fall back to message timestamp if no raid date
  const finalLinks = Array.from(uniqueLinks.values()).sort((a, b) => {
    const aTime = a.raidDateTime
      ? new Date(a.raidDateTime).getTime()
      : new Date(a.timestamp).getTime();
    const bTime = b.raidDateTime
      ? new Date(b.raidDateTime).getTime()
      : new Date(b.timestamp).getTime();

    return aTime - bTime; // Ascending order (earliest first)
  });

  console.log(
    `[SoftRes] Found ${finalLinks.length} RaidHelper posts with SoftRes links`,
  );

  return finalLinks;
}
