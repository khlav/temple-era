import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { CreateSoftresResponseSchema } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { checkUserPermissions } from "../services/permissionChecker.js";
import { buildAdminSoftresEmbed, buildPublicSoftresEmbed } from "../services/softresEmbeds.js";

// Discord shows `name`; the bot/web exchange `value`, matching RAID_ZONE_CONFIG's instance
// slugs (apps/web/src/lib/raid-zones.ts) so no new identifier space is invented here.
const ZONE_CHOICES = [
  { name: "Onyxia's Lair", value: "onyxia" },
  { name: "Molten Core", value: "mc" },
  { name: "Blackwing Lair", value: "bwl" },
  { name: "Zul'Gurub", value: "zg" },
  { name: "Ruins of Ahn'Qiraj (AQ20)", value: "aq20" },
  { name: "Temple of Ahn'Qiraj (AQ40)", value: "aq40" },
  { name: "Naxxramas", value: "naxxramas" },
] as const;

export const srCommandData = new SlashCommandBuilder()
  .setName("sr")
  .setDescription("Create a SoftRes soft-reserve raid for a zone")
  .addStringOption((option) =>
    option
      .setName("zone")
      .setDescription("Which zone to create the SR for")
      .setRequired(true)
      .addChoices(...ZONE_CHOICES),
  );

/**
 * Manual escape hatch (TEMPLE-123) for the automated SoftRes detection in Phases 1-2: a raid
 * lead/manager runs `/sr <zone>` to create a SR on demand, for any of the 7 known classic
 * zones, without visiting softres.it directly.
 *
 * Permission-denied and error replies are ephemeral (private to the invoker) — only a
 * successful creation is meant to be visible to others in the channel the command was run
 * from, so a raid lead running `/sr` in a raid channel makes the link visible there too.
 */
export async function handleSrCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const zone = interaction.options.getString("zone", true);

  const permissions = await checkUserPermissions(interaction.user.id);
  if (!permissions.success || !permissions.hasAccount || !permissions.canAccessSoftres) {
    await interaction.reply({
      content: "You don't have permission to create SoftRes raids.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const response = await fetch(`${config.apiBaseUrl}/api/discord/create-softres`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.templeWebApiToken}`,
      },
      body: JSON.stringify({ zone }),
    });

    const payload: unknown = await response.json();
    const parsed = CreateSoftresResponseSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error(
        { endpoint: "/api/discord/create-softres", zone, error: parsed.error.message },
        "Unexpected response shape from create-softres",
      );
      await interaction.reply({
        content: "Something went wrong creating the SR.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const result = parsed.data;

    if (!("success" in result) || !result.success) {
      logger.error(
        { zone, error: "error" in result ? result.error : "unknown" },
        "create-softres reported failure",
      );
      await interaction.reply({
        content: "Something went wrong creating the SR.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const title = `SRs : ${result.zone}`;

    // Public reply — a successful creation is meant to be visible to others in the channel
    // the command was run from, unlike the permission-denied/error replies above and below.
    // Uses `publicUrl`, never `adminUrl` — the admin token must never appear outside the
    // SoftRes Token thread.
    const publicEmbed = buildPublicSoftresEmbed({
      title,
      dateLabel: result.createdDate,
      links: [{ zone: result.zone, url: result.publicUrl }],
    });
    await interaction.reply({ embeds: [publicEmbed] });

    const thread = await interaction.client.channels.fetch(config.discordSoftresTokenThreadId);
    if (thread?.isSendable()) {
      const adminEmbed = buildAdminSoftresEmbed({
        title,
        dateLabel: result.createdDate,
        links: [{ zone: result.zone, url: result.adminUrl }],
      });
      await thread.send({ embeds: [adminEmbed] });
    } else {
      logger.error(
        { threadId: config.discordSoftresTokenThreadId },
        "SoftRes Token thread channel is not fetchable or not sendable",
      );
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), zone },
      "Error creating SoftRes via /sr",
    );
    // The Token-thread post above runs after the success reply, so a failure there must not
    // trigger a second reply to an already-acknowledged interaction.
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong creating the SR.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
