import dotenv from "dotenv";
dotenv.config();

export const config = {
  discordBotToken: process.env.DISCORD_BOT_TOKEN!,
  discordLogsChannelId: process.env.DISCORD_RAID_LOGS_CHANNEL_ID!,
  apiBaseUrl: process.env.API_BASE_URL!,
  templeWebApiToken: process.env.TEMPLE_WEB_API_TOKEN!,
};

// Validate required environment variables
const required = Object.keys(config);
for (const key of required) {
  if (!config[key as keyof typeof config]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
