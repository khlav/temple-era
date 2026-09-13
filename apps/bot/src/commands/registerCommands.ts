import { REST, Routes, type Client } from "discord.js";
import { srCommandData } from "./srCommand.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Registers the `/sr` command with Discord for this bot's single guild. Called once per bot
 * startup from `ClientReady` — registering the same command set twice is a no-op on Discord's
 * side (`PUT` replaces the full guild command list), so this is safe to run on every restart,
 * and means a future command-definition change ships automatically.
 *
 * Guild-scoped, not global: this bot serves exactly one guild, and guild-scoped commands
 * propagate instantly (global registration can take up to an hour to show up everywhere).
 */
export async function registerCommands(client: Client): Promise<void> {
  if (!client.application) {
    logger.error("Cannot register commands: client.application is not available");
    return;
  }
  const rest = new REST().setToken(config.discordBotToken);
  try {
    await rest.put(Routes.applicationGuildCommands(client.application.id, config.discordServerId), {
      body: [srCommandData.toJSON()],
    });
    logger.info("Registered /sr slash command");
  } catch (error) {
    logger.error({ err: error }, "Failed to register slash commands");
  }
}
