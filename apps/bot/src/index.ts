import { createBot } from './bot.js';
import { config } from './config/env.js';

async function main() {
  console.log('🚀 Starting Discord bot...');
  
  const bot = createBot();
  
  try {
    await bot.login(config.discordBotToken);
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main();
