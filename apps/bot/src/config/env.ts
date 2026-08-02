import dotenv from "dotenv";

// quiet: required from dotenv 17 onward. It otherwise prints a promotional banner to
// stdout on every startup, which lands as a non-JSON line in the middle of the bot's
// structured log stream — precisely where operators look for the startup signal after a
// Northflank deploy. There is normally no .env here at all; secrets come from Doppler
// locally and from a Northflank secret group in production.
dotenv.config({ quiet: true });

export const config = {
  discordBotToken: process.env.DISCORD_BOT_TOKEN!,
  discordLogsChannelId: process.env.DISCORD_RAID_LOGS_CHANNEL_ID!,
  apiBaseUrl: process.env.API_BASE_URL!,
  templeWebApiToken: process.env.TEMPLE_WEB_API_TOKEN!,
  // Logging configuration
  logLevel: process.env.LOG_LEVEL || "info",
  // Thread cleanup configuration (optional - disabled by default)
  threadCleanupEnabled: process.env.DISCORD_LOG_THREAD_CLEANUP_ENABLED === "true",
  threadCleanupDays: parseInt(process.env.DISCORD_LOG_THREAD_CLEANUP_DAYS || "3", 10),
  threadCleanupCron: process.env.DISCORD_LOG_THREAD_CLEANUP_CRON || "0 1 * * *",
};

// Validate required environment variables
const required = ["discordBotToken", "discordLogsChannelId", "apiBaseUrl", "templeWebApiToken"];

for (const key of required) {
  if (!config[key as keyof typeof config]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
