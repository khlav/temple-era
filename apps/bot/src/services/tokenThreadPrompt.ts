import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Client,
  type Message,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  ResolveSoftresEventResponseSchema,
  type ResolveSoftresEventResult,
} from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { MessageDeduplicator } from "../utils/messageDeduplication.js";
import { checkUserPermissions } from "./permissionChecker.js";
import {
  formatRaidWhen,
  isRaidInWeeklyBlock,
  postWeeklyTokenEntries,
} from "./tokenThreadSummary.js";
import { getZoneEmoji } from "./zoneEmoji.js";

/**
 * When someone posts a softres.it admin link in the SoftRes Token thread by hand, offer to add it
 * to that week's "SR Admin Tokens" block — the same block `/sr` and the automatic flow write to.
 *
 * SoftRes knows a raid's zone but not its date, so the raid night comes from the matching Raid
 * Helper event (resolved by the web app's `resolve-softres-event`). When the zone or the event
 * can't be pinned down the bot stays silent rather than guess a date into the block.
 *
 * Discord only allows ephemeral messages as replies to an interaction, so the prompt itself is an
 * ordinary reply under the poster's message; the click is answered ephemerally and the prompt is
 * then removed. The admin token is never put in a custom id — the click re-reads the original
 * message for it.
 */

const ADD_PREFIX = "tokadd";
const PICK_PREFIX = "tokpick";
const DISMISS_PREFIX = "tokdismiss";
const MAX_LINKS_PER_MESSAGE = 3;

// Alphanumeric like softres.it's own ids, but a following `-`/`_` rejects the match instead of
// truncating it — the same chars tokenThreadSummary's parseAdminUrl accepts, so a token is never
// written into the shared block cut short.
const ADMIN_LINK_REGEX =
  /softres\.it\/raid\/([A-Za-z0-9]+)(?![\w.-])\?adminToken=([A-Za-z0-9]+)(?![A-Za-z0-9_-])/g;
const DATE_REGEX = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

// Zone names come back from the web app; a custom id has 100 chars, so carry a short code.
const ZONE_CODES: Record<string, string> = {
  Onyxia: "ony",
  "Molten Core": "mc",
  "Blackwing Lair": "bwl",
  "Zul'Gurub": "zg",
  "Ruins of Ahn'Qiraj": "aq20",
  "Temple of Ahn'Qiraj": "aq40",
  Naxxramas: "naxx",
};
const CODE_TO_ZONE = Object.fromEntries(Object.entries(ZONE_CODES).map(([z, c]) => [c, z]));

const deduplicator = new MessageDeduplicator();

export interface AdminLink {
  raidId: string;
  adminToken: string;
}

export function extractAdminLinks(content: string): AdminLink[] {
  const seen = new Set<string>();
  const links: AdminLink[] = [];
  for (const match of content.matchAll(ADMIN_LINK_REGEX)) {
    const [, raidId, adminToken] = match;
    if (raidId && adminToken && !seen.has(raidId)) {
      seen.add(raidId);
      links.push({ raidId, adminToken });
    }
  }
  return links;
}

/**
 * The raid night a raid lead named in their message ("Naxx Tue 09/29", "Sunday BWL/MC
 * 09/13/2026"), as `YYYY-MM-DD`, or undefined. A missing year is the current one, rolled to the
 * next year when that would put the date well in the past (a December message naming 1/5).
 */
export function parseDateHint(content: string, now: Date = new Date()): string | undefined {
  const match = DATE_REGEX.exec(content);
  if (!match) return undefined;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  let year: number;
  if (match[3]) {
    year = Number(match[3]);
    if (year < 100) year += 2000;
  } else {
    year = now.getUTCFullYear();
    const asDate = Date.UTC(year, month - 1, day);
    if (asDate < now.getTime() - 60 * 24 * 60 * 60 * 1000) year += 1;
  }
  // Reject impossible dates (2/31) instead of letting Date roll them into another month.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function resolveEvent(
  raidId: string,
  dateHint: string | undefined,
): Promise<ResolveSoftresEventResult | null> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/discord/resolve-softres-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.templeWebApiToken}`,
      },
      body: JSON.stringify({ raidId, ...(dateHint ? { dateHint } : {}) }),
    });
    const parsed = ResolveSoftresEventResponseSchema.safeParse(await response.json());
    if (!parsed.success || !("success" in parsed.data)) {
      logger.error(
        { raidId, status: response.status },
        "Unexpected response from resolve-softres-event",
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    logger.error(
      { raidId, error: error instanceof Error ? error.message : String(error) },
      "Error calling resolve-softres-event",
    );
    return null;
  }
}

export async function handleTokenThreadMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.channelId !== config.discordSoftresTokenThreadId) return;

  const links = extractAdminLinks(message.content).slice(0, MAX_LINKS_PER_MESSAGE);
  if (links.length === 0) return;
  if (deduplicator.has(message.id)) return;
  deduplicator.add(message.id);

  const dateHint = parseDateHint(message.content);

  for (const link of links) {
    try {
      await promptForLink(message, link, dateHint);
    } catch (error) {
      logger.error(
        { messageId: message.id, raidId: link.raidId, err: error },
        "Failed to prompt for a posted SoftRes admin link",
      );
    }
  }
}

async function promptForLink(
  message: Message,
  link: AdminLink,
  dateHint: string | undefined,
): Promise<void> {
  const resolved = await resolveEvent(link.raidId, dateHint);
  if (!resolved?.success || !resolved.zone || resolved.candidates.length === 0) {
    logger.info(
      { raidId: link.raidId, dateHint, zone: resolved?.success ? resolved.zone : undefined },
      "Not enough information to offer a token-block entry for a posted SoftRes link",
    );
    return;
  }
  const zoneCode = ZONE_CODES[resolved.zone];
  if (!zoneCode) return;

  // Already recorded (by the bot, or an earlier click)? Nothing to offer.
  const known = await Promise.all(
    resolved.candidates.map((c) => isRaidInWeeklyBlock(message.client, link.raidId, c.timestamp)),
  );
  if (known.some(Boolean)) return;

  const base = `${message.id}:${link.raidId}:${zoneCode}`;
  const dismiss = new ButtonBuilder()
    .setCustomId(`${DISMISS_PREFIX}:${message.id}`)
    .setLabel("Dismiss")
    .setStyle(ButtonStyle.Secondary);

  if (resolved.candidates.length === 1) {
    const only = resolved.candidates[0]!;
    await message.reply({
      content: `Add **${resolved.zone}** · ${formatRaidWhen(only.timestamp)} to this week's SR Admin Tokens block?`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${ADD_PREFIX}:${base}:${only.timestamp}`)
            .setLabel("Add to block")
            .setStyle(ButtonStyle.Success),
          dismiss,
        ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await message.reply({
    content: `Which **${resolved.zone}** raid is this SR for? I'll add it to that week's SR Admin Tokens block.`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PICK_PREFIX}:${base}`)
          .setPlaceholder("Pick the raid")
          .addOptions(
            resolved.candidates.map((c) => ({
              label: formatRaidWhen(c.timestamp),
              description: c.title.slice(0, 100),
              value: String(c.timestamp),
            })),
          ),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(dismiss),
    ],
    allowedMentions: { repliedUser: false },
  });
}

export function isTokenPromptCustomId(customId: string): boolean {
  return [ADD_PREFIX, PICK_PREFIX, DISMISS_PREFIX].some((p) => customId.startsWith(`${p}:`));
}

/** Handles the Add / Dismiss buttons and the raid picker. Answers ephemerally, then removes the
 * prompt so the thread doesn't collect stale ones. */
export async function handleTokenPromptInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [action, sourceMessageId, raidId, zoneCode, tsFromId] = interaction.customId.split(":");
    const source = await fetchSourceMessage(interaction.client, sourceMessageId);
    if (!source) {
      await interaction.editReply({ content: "I can't find the original message anymore." });
      await removePrompt(interaction);
      return;
    }

    // The poster owns their own link; anyone else needs SoftRes access (same gate as /sr).
    if (interaction.user.id !== source.author.id) {
      const permissions = await checkUserPermissions(interaction.user.id);
      if (!permissions.success || !permissions.hasAccount || !permissions.canAccessSoftres) {
        await interaction.editReply({
          content:
            "Only the person who posted this link, or someone with SoftRes access, can do that.",
        });
        return;
      }
    }

    if (action === DISMISS_PREFIX) {
      await interaction.editReply({ content: "Dismissed — nothing was added." });
      await removePrompt(interaction);
      return;
    }

    const zone = zoneCode ? CODE_TO_ZONE[zoneCode] : undefined;
    const timestampSec = Number(
      interaction.isStringSelectMenu() ? interaction.values[0] : tsFromId,
    );
    const link = raidId
      ? extractAdminLinks(source.content).find((l) => l.raidId === raidId)
      : undefined;
    if (!zone || !link || !Number.isFinite(timestampSec)) {
      await interaction.editReply({ content: "That prompt is no longer valid." });
      await removePrompt(interaction);
      return;
    }

    await postWeeklyTokenEntries(interaction.client, [
      {
        zone,
        url: `https://softres.it/raid/${link.raidId}?adminToken=${link.adminToken}`,
        emoji: getZoneEmoji(zone),
        timestampSec,
      },
    ]);
    await interaction.editReply({
      content: `Added **${zone}** · ${formatRaidWhen(timestampSec)} to this week's SR Admin Tokens block.`,
    });
    await removePrompt(interaction);
  } catch (error) {
    logger.error(
      { customIdPrefix: interaction.customId.split(":")[0], err: error },
      "Error handling a token-block prompt interaction",
    );
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "Something went wrong adding that." });
      }
    } catch (replyError) {
      logger.error({ err: replyError }, "Failed to report a token-block prompt failure");
    }
  }
}

async function fetchSourceMessage(
  client: Client,
  messageId: string | undefined,
): Promise<Message | null> {
  if (!messageId) return null;
  try {
    const thread = await client.channels.fetch(config.discordSoftresTokenThreadId);
    if (!thread?.isTextBased()) return null;
    return await thread.messages.fetch({ message: messageId, cache: false });
  } catch {
    return null;
  }
}

async function removePrompt(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  try {
    await interaction.message.delete();
  } catch (error) {
    logger.warn({ err: error }, "Could not delete a token-block prompt message");
  }
}
