import type { Client } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * One Blizzard icon-texture per zone (the same `wow.zamimg.com` CDN the web app's achievement
 * badges already use), keyed by the exact zone display name `ensure-softres` and
 * `create-softres` both return as `zone` (apps/web's `RAID_ZONE_CONFIG`). Each texture name was
 * checked against the web app's own `wow-icon-names.json` dump before being picked here, and
 * confirmed by actually rendering them for review — not guessed.
 */
const ZONE_ICON_SOURCES: Record<string, { emojiName: string; iconUrl: string }> = {
  "Molten Core": {
    emojiName: "mc_ragnaros",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_ragnaros.jpg",
  },
  "Blackwing Lair": {
    emojiName: "bwl_nefarian",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_nefarion.jpg",
  },
  "Temple of Ahn'Qiraj": {
    emojiName: "aq40_cthun",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_cthun.jpg",
  },
  Naxxramas: {
    emojiName: "naxx_kelthuzad",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_kelthuzad_01.jpg",
  },
  Onyxia: {
    emojiName: "ony_onyxia",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_onyxia.jpg",
  },
  "Zul'Gurub": {
    emojiName: "zg_hakkar",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_hakkar.jpg",
  },
  "Ruins of Ahn'Qiraj": {
    emojiName: "aq20_ossirian",
    iconUrl:
      "https://wow.zamimg.com/images/wow/icons/medium/achievement_boss_ossiriantheunscarred.jpg",
  },
};

let zoneEmojiCache: Map<string, string> | null = null;

/**
 * Uploads any missing zone emoji to the configured guild and builds the zone-name ->
 * `<:name:id>` lookup table `getZoneEmoji` reads from. Idempotent — an emoji already present
 * (matched by name) is reused, never re-uploaded, so this is safe to call on every startup. A
 * failure uploading one zone's emoji is logged and that zone is simply absent from the lookup
 * rather than aborting the rest — a missing icon degrades to a plain text line, not a crash.
 */
export async function ensureZoneEmoji(client: Client): Promise<void> {
  const cache = new Map<string, string>();
  try {
    const guild = await client.guilds.fetch(config.discordServerId);
    const existing = await guild.emojis.fetch();

    for (const [zoneName, { emojiName, iconUrl }] of Object.entries(ZONE_ICON_SOURCES)) {
      let emoji = existing.find((e) => e.name === emojiName);
      if (!emoji) {
        try {
          emoji = await guild.emojis.create({ attachment: iconUrl, name: emojiName });
          logger.info({ zoneName, emojiName }, "Uploaded zone emoji");
        } catch (error) {
          logger.error(
            {
              zoneName,
              emojiName,
              error: error instanceof Error ? error.message : String(error),
            },
            "Failed to upload zone emoji",
          );
          continue;
        }
      }
      cache.set(zoneName, `<:${emoji.name}:${emoji.id}>`);
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to ensure zone emoji",
    );
  }
  zoneEmojiCache = cache;
}

/**
 * `<:name:id>` for a zone, or `undefined` if it hasn't been uploaded/cached yet — e.g.
 * `ensureZoneEmoji` hasn't finished, or its upload for this specific zone failed. Callers treat
 * an undefined emoji as "no icon for this line" rather than blocking the SR link on it.
 */
export function getZoneEmoji(zoneName: string): string | undefined {
  return zoneEmojiCache?.get(zoneName);
}
