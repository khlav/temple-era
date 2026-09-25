import {
  ZONE_EMOJI_NAMES,
  buildWeeklyBlockEmbed,
  weeklyBlockFooter,
  type EmbedData,
  type WeeklyTokenEntry,
} from "@temple-era/softres-blocks";
import { env } from "~/env.js";
import { logger } from "~/lib/logger";

/**
 * Discord REST transport for the SoftRes posts — the web app's counterpart to the bot's discord.js
 * code. What the embeds say (and how the weekly block is parsed and merged) comes from
 * `@temple-era/softres-blocks`, shared with the bot, so a block edited from here and from the
 * bot's `/sr` stays one consistent message. The web app has no discord.js, so this speaks REST
 * with the same bot token the rest of the app already uses.
 */

const DISCORD_API = "https://discord.com/api/v10";
const TIMEOUT_MS = 10_000;

interface DiscordMessage {
  id: string;
  author: { id: string };
  embeds?: Array<{ description?: string; url?: string; footer?: { text?: string } }>;
}

async function discord<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    // Status only: an error body can echo request content, and these requests carry admin links.
    throw new Error(
      `Discord API ${init.method ?? "GET"} ${path.split("?")[0]} -> ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

let botUserId: string | null = null;

async function getBotUserId(): Promise<string> {
  botUserId ??= (await discord<{ id: string }>("/users/@me")).id;
  return botUserId;
}

/** Whether the Token thread is set up and reachable — checked BEFORE an SR is created, since an
 * admin token that can't be saved is an SR nobody can manage. */
export async function isTokenThreadUsable(): Promise<boolean> {
  const threadId = env.DISCORD_SOFTRES_TOKEN_THREAD_ID;
  if (!threadId) return false;
  try {
    await discord(`/channels/${threadId}`);
    return true;
  } catch (error) {
    logger.error(
      { threadId, error: error instanceof Error ? error.message : String(error) },
      "SoftRes Token thread is not reachable",
    );
    return false;
  }
}

/**
 * `<:name:id>` per zone name, from the guild's emoji list. The bot uploads these at startup; this
 * only looks them up, so a zone without one just renders as plain text — best-effort, never
 * blocks an SR.
 */
export async function getZoneEmojiMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const emojis = await discord<Array<{ id: string; name: string }>>(
      `/guilds/${env.DISCORD_SERVER_ID}/emojis`,
    );
    for (const [zone, name] of Object.entries(ZONE_EMOJI_NAMES)) {
      const emoji = emojis.find((e) => e.name === name);
      if (emoji) map.set(zone, `<:${emoji.name}:${emoji.id}>`);
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Could not load zone emoji; posting without icons",
    );
  }
  return map;
}

/**
 * Whether the bot already posted an SR embed linking to this signup message — the same match the
 * bot's roster-forward uses (embed URL === the signup message link). Guards against creating a
 * second SR for a raid the automatic flow (or an earlier request) already covered. False if the
 * channel can't be read: the caller has other guards, and a lookup failure shouldn't block.
 */
export async function hasSrPostForEvent(channelId: string, eventUrl: string): Promise<boolean> {
  try {
    const [botId, recent] = await Promise.all([
      getBotUserId(),
      discord<DiscordMessage[]>(`/channels/${channelId}/messages?limit=100`),
    ]);
    return recent.some((m) => m.author.id === botId && m.embeds?.some((e) => e.url === eventUrl));
  } catch (error) {
    logger.warn(
      { channelId, error: error instanceof Error ? error.message : String(error) },
      "Could not check for an existing SR post",
    );
    return false;
  }
}

/** Posts an embed to a channel; returns the new message's id. */
export async function postChannelEmbed(channelId: string, embed: EmbedData): Promise<string> {
  const message = await discord<{ id: string }>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [embed] }),
  });
  return message.id;
}

/**
 * Finds (or creates) the lockout week's admin-token block in the Token thread and merges
 * `entries` into it — the REST twin of the bot's `postWeeklyTokenEntries`. The week's message is
 * re-derived from the thread's history by its footer marker, so there is no state to lose.
 * Throws on failure; the caller decides what a lost token means.
 */
export async function upsertWeeklyTokenBlock(entries: WeeklyTokenEntry[]): Promise<void> {
  const threadId = env.DISCORD_SOFTRES_TOKEN_THREAD_ID;
  if (!threadId) throw new Error("DISCORD_SOFTRES_TOKEN_THREAD_ID is not set");
  if (entries.length === 0) return;

  const [botId, recent] = await Promise.all([
    getBotUserId(),
    discord<DiscordMessage[]>(`/channels/${threadId}/messages?limit=50`),
  ]);
  const footer = weeklyBlockFooter(entries[0]!.timestampSec);
  const existing = recent.find(
    (m) => m.author.id === botId && m.embeds?.[0]?.footer?.text === footer,
  );

  const embed = buildWeeklyBlockEmbed(existing?.embeds?.[0]?.description, entries);
  if (existing) {
    await discord(`/channels/${threadId}/messages/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ embeds: [embed] }),
    });
  } else {
    await discord(`/channels/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ embeds: [embed] }),
    });
  }
}
