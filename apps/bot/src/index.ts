import { createBot } from "./bot.js";
import { config } from "./config/env.js";
import { logger } from "./config/logger.js";

async function main() {
  logger.info("Starting Discord bot...");

  const bot = createBot();

  try {
    await bot.login(config.discordBotToken);
  } catch (error) {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main();
