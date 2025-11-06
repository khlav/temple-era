import {
  Client,
  GatewayIntentBits,
  Events,
  type Message,
  Options,
} from "discord.js";
import * as cron from "node-cron";
import { config } from "./config/env.js";
import { logger } from "./config/logger.js";
import { handleMessage } from "./handlers/messageHandler.js";
import { handleThreadMessage } from "./handlers/threadMessageHandler.js";
import { handleMessageUpdate } from "./handlers/messageUpdateHandler.js";
import { cleanupOldThreads } from "./services/threadCleanup.js";

export function createBot(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    // Aggressive cache limits to reduce memory usage
    makeCache: Options.cacheWithLimits({
      MessageManager: {
        maxSize: 0, // Disable message caching - we fetch when needed
      },
      ChannelManager: {
        maxSize: 0, // Disable channel caching - we fetch when needed
      },
      GuildManager: {
        maxSize: 2, // Keep minimal guild cache (1-2 guilds)
      },
      UserManager: {
        maxSize: 20, // Keep small user cache for permissions
      },
      ThreadManager: {
        maxSize: 0, // Disable thread caching - we fetch when needed
      },
      ThreadMemberManager: {
        maxSize: 0, // Disable thread member caching
      },
      ReactionManager: {
        maxSize: 0, // Disable reaction caching
      },
      PresenceManager: {
        maxSize: 0, // Disable presence caching
      },
      VoiceStateManager: {
        maxSize: 0, // Disable voice state caching
      },
      ApplicationCommandManager: {
        maxSize: 0, // Disable application command caching
      },
    }),
  });

  client.on(Events.ClientReady, () => {
    logger.info(`Bot logged in as ${client.user?.tag}`);
    logger.info(`Monitoring channel: ${config.discordLogsChannelId}`);

    // Schedule thread cleanup job
    if (config.threadCleanupEnabled) {
      cron.schedule(
        config.threadCleanupCron,
        () => {
          void cleanupOldThreads(client);
        },
        {
          timezone: "America/New_York",
        }
      );

      logger.info(`Thread cleanup scheduled: ${config.threadCleanupCron} (ET)`);
      logger.info(`Cleanup will run daily at 1am Eastern Time`);
    } else {
      logger.info("Thread cleanup is disabled");
    }
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.channel.isThread()) {
      void handleThreadMessage(message);
    } else {
      void handleMessage(message);
    }
  });

  client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    // Only process if newMessage is a partial message (Discord.js behavior)
    if (newMessage.partial) {
      void newMessage.fetch().catch((error) => {
        logger.error("Could not fetch the updated message:", error);
      });
      return;
    }

    // Only process main channel messages (not threads)
    if (!newMessage.channel.isThread()) {
      void handleMessageUpdate(oldMessage as Message, newMessage as Message);
    }
  });

  client.on(Events.Error, (error) => {
    logger.error("Discord client error:", error);
  });

  return client;
}
