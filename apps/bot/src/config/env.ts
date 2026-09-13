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
  // SoftRes automation: the Raid-Helper signup channels to watch, the Raid-Helper bot's own
  // user ID, and the Token thread admin links get posted to. The first two already carry real
  // values in every Doppler config (apps/web already reads them); only the third is new.
  discordRaidSrChannelIds: (process.env.DISCORD_RAID_SR_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  discordRaidHelperBotId: process.env.DISCORD_RAID_HELPER_BOT_ID!,
  discordSoftresTokenThreadId: process.env.DISCORD_SOFTRES_TOKEN_THREAD_ID!,
  // Logging configuration
  logLevel: process.env.LOG_LEVEL || "info",
  // Thread cleanup configuration (optional - disabled by default)
  threadCleanupEnabled: process.env.DISCORD_LOG_THREAD_CLEANUP_ENABLED === "true",
  threadCleanupDays: parseInt(process.env.DISCORD_LOG_THREAD_CLEANUP_DAYS || "3", 10),
  threadCleanupCron: process.env.DISCORD_LOG_THREAD_CLEANUP_CRON || "0 1 * * *",
};

// Validate required environment variables
const required = [
  "discordBotToken",
  "discordLogsChannelId",
  "apiBaseUrl",
  "templeWebApiToken",
  "discordRaidHelperBotId",
  "discordSoftresTokenThreadId",
];

for (const key of required) {
  if (!config[key as keyof typeof config]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// discordRaidSrChannelIds is array-valued, so the `!config[key]` truthy check above never flags
// an empty array as missing — check its length separately.
if (config.discordRaidSrChannelIds.length === 0) {
  throw new Error(
    "Missing required environment variable: discordRaidSrChannelIds (DISCORD_RAID_SR_CHANNEL_IDS)",
  );
}
