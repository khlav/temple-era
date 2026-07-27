import { env } from "~/env.js";
import { logger } from "~/lib/logger";

export interface DiscordGuildRole {
  id: string;
  name: string;
}

export interface DiscordGuildMember {
  user: { id: string; username: string; global_name?: string };
  roles: string[];
}

/**
 * List every role defined on the guild. Small payload (Discord caps guilds at 250 roles), no
 * pagination needed.
 */
export async function getGuildRoles(): Promise<DiscordGuildRole[]> {
  const url = `https://discord.com/api/v10/guilds/${env.DISCORD_SERVER_ID}/roles`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Discord API error fetching guild roles: ${response.status} ${response.statusText}`,
    );
  }

  const roles: Array<{ id: string; name: string }> = await response.json();
  return roles.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * List every member of the guild, with their role IDs, paginated via the `after` cursor.
 * Requires the privileged "Server Members Intent" to be enabled for the bot in the Discord
 * Developer Portal — without it, Discord returns a 403 here.
 */
export async function getGuildMembers(): Promise<DiscordGuildMember[]> {
  const members: DiscordGuildMember[] = [];
  let after: string | undefined;

  for (;;) {
    const url = new URL(`https://discord.com/api/v10/guilds/${env.DISCORD_SERVER_ID}/members`);
    url.searchParams.set("limit", "1000");
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Discord API error fetching guild members: ${response.status} ${response.statusText}`,
      );
    }

    const page: DiscordGuildMember[] = await response.json();
    members.push(...page);

    logger.debug(`[Discord Sync] Fetched ${page.length} guild members (total ${members.length})`);

    if (page.length < 1000) break;
    const lastMember = page[page.length - 1];
    if (!lastMember) break;
    after = lastMember.user.id;
  }

  return members;
}
