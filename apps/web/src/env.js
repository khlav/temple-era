import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    AUTH_DISCORD_ID: z.string(),
    AUTH_DISCORD_SECRET: z.string(),
    DATABASE_URL: z.string().url(),

    WCL_CLIENT_ID: z.string(),
    WCL_CLIENT_SECRET: z.string(),
    WCL_OAUTH_URL: z.string(),
    WCL_API_URL: z.string(),

    BATTLENET_OAUTH_URL: z.string(),
    BATTLENET_CLIENT_ID: z.string(),
    BATTLENET_CLIENT_SECRET: z.string(),

    DISCORD_BOT_TOKEN: z.string(),
    DISCORD_RAID_LOGS_CHANNEL_ID: z.string(),
    TEMPLE_WEB_API_TOKEN: z.string(),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    GOOGLE_SITE_VERIFICATION: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_POSTHOG_ENABLED: z
      .string()
      .transform((val) => val.toLowerCase() === "true"),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
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

    WCL_CLIENT_ID: process.env.WCL_CLIENT_ID,
    WCL_CLIENT_SECRET: process.env.WCL_CLIENT_SECRET,
    WCL_OAUTH_URL: process.env.WCL_OAUTH_URL,
    WCL_API_URL: process.env.WCL_API_URL,

    BATTLENET_OAUTH_URL: process.env.BATTLENET_OAUTH_URL,
    BATTLENET_CLIENT_ID: process.env.BATTLENET_CLIENT_ID,
    BATTLENET_CLIENT_SECRET: process.env.BATTLENET_CLIENT_SECRET,

    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_RAID_LOGS_CHANNEL_ID: process.env.DISCORD_RAID_LOGS_CHANNEL_ID,
    TEMPLE_WEB_API_TOKEN: process.env.TEMPLE_WEB_API_TOKEN,

    NEXT_PUBLIC_POSTHOG_ENABLED: process.env.NEXT_PUBLIC_POSTHOG_ENABLED,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,

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
