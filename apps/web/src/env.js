import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET: process.env.NODE_ENV === "production" ? z.string() : z.string().optional(),
    AUTH_DISCORD_ID: z.string(),
    AUTH_DISCORD_SECRET: z.string(),
    DATABASE_URL: z.string().url(),
    DATABASE_MIGRATION_URL: z.string().url().optional(),

    WCL_CLIENT_ID: z.string(),
    WCL_CLIENT_SECRET: z.string(),
    WCL_OAUTH_URL: z.string(),
    WCL_API_URL: z.string(),

    BATTLENET_OAUTH_URL: z.string(),
    BATTLENET_CLIENT_ID: z.string(),
    BATTLENET_CLIENT_SECRET: z.string(),

    DISCORD_BOT_TOKEN: z.string(),
    DISCORD_RAID_LOGS_CHANNEL_ID: z.string(),
    DISCORD_RAID_SR_CHANNEL_IDS: z.string().transform((str) => str.split(",").map((s) => s.trim())),
    DISCORD_RAID_HELPER_BOT_ID: z.string(),
    DISCORD_WEBHOOK_PUBLIC_KEY: z.string().optional(),
    DISCORD_SERVER_ID: z.string(),
    // Break-glass superadmins: comma-separated Discord user IDs granted every scope, resolved
    // from env rather than the DB so access cannot be revoked through the admin UI.
    SUPERADMIN_DISCORD_IDS: z
      .string()
      .optional()
      .transform((str) =>
        str
          ? str
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      ),
    RAID_HELPER_API_KEY: z.string(),
    // Excludes the guild's #rh-signup-archive channel from fetchScheduledEvents() —
    // Raid Helper's events list otherwise returns every event ever posted there,
    // regardless of age. See raid-helper-client.ts.
    DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID: z.string().optional(),
    TEMPLE_WEB_API_TOKEN: z.string(),
    API_TOKEN_ENCRYPTION_KEY: z.string().min(1),
    // QStash (Upstash) — schedules the Raid Helper signup snapshot discovery poll and
    // per-checkpoint captures. See /api/qstash/raid-helper-discovery and
    // /api/qstash/raid-helper-capture. Signing keys verify inbound webhook requests via
    // verifySignatureAppRouter from @upstash/qstash/nextjs.
    QSTASH_TOKEN: z.string(),
    QSTASH_CURRENT_SIGNING_KEY: z.string(),
    QSTASH_NEXT_SIGNING_KEY: z.string(),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    GOOGLE_SITE_VERIFICATION: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_POSTHOG_ENABLED: z.string().transform((val) => val.toLowerCase() === "true"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL: z.string().url(),
    NEXT_PUBLIC_RAID_POLICY_URL: z.string().url(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
    AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,

    WCL_CLIENT_ID: process.env.WCL_CLIENT_ID,
    WCL_CLIENT_SECRET: process.env.WCL_CLIENT_SECRET,
    WCL_OAUTH_URL: process.env.WCL_OAUTH_URL,
    WCL_API_URL: process.env.WCL_API_URL,

    BATTLENET_OAUTH_URL: process.env.BATTLENET_OAUTH_URL,
    BATTLENET_CLIENT_ID: process.env.BATTLENET_CLIENT_ID,
    BATTLENET_CLIENT_SECRET: process.env.BATTLENET_CLIENT_SECRET,

    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_RAID_LOGS_CHANNEL_ID: process.env.DISCORD_RAID_LOGS_CHANNEL_ID,
    DISCORD_RAID_SR_CHANNEL_IDS: process.env.DISCORD_RAID_SR_CHANNEL_IDS,
    DISCORD_RAID_HELPER_BOT_ID: process.env.DISCORD_RAID_HELPER_BOT_ID,
    DISCORD_WEBHOOK_PUBLIC_KEY: process.env.DISCORD_WEBHOOK_PUBLIC_KEY,
    DISCORD_SERVER_ID: process.env.DISCORD_SERVER_ID,
    SUPERADMIN_DISCORD_IDS: process.env.SUPERADMIN_DISCORD_IDS,
    RAID_HELPER_API_KEY: process.env.RAID_HELPER_API_KEY,
    DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID: process.env.DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID,
    TEMPLE_WEB_API_TOKEN: process.env.TEMPLE_WEB_API_TOKEN,
    API_TOKEN_ENCRYPTION_KEY: process.env.API_TOKEN_ENCRYPTION_KEY,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,

    NEXT_PUBLIC_POSTHOG_ENABLED: process.env.NEXT_PUBLIC_POSTHOG_ENABLED,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL: process.env.NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL,
    NEXT_PUBLIC_RAID_POLICY_URL: process.env.NEXT_PUBLIC_RAID_POLICY_URL,

    NODE_ENV: process.env.NODE_ENV,
    GOOGLE_SITE_VERIFICATION: process.env.GOOGLE_SITE_VERIFICATION,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
