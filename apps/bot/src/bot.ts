import { Client, GatewayIntentBits, Events, type Message } from "discord.js";
import * as cron from "node-cron";
import { config } from "./config/env.js";
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
  });

  client.on(Events.ClientReady, () => {
    console.log(`✅ Bot logged in as ${client.user?.tag}`);
    console.log(`📡 Monitoring channel: ${config.discordLogsChannelId}`);

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

      console.log(
        `🧹 Thread cleanup scheduled: ${config.threadCleanupCron} (ET)`
      );
      console.log(`⏰ Cleanup will run daily at 1am Eastern Time`);
    } else {
      console.log("🧹 Thread cleanup is disabled");
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
        console.log("Could not fetch the updated message:", error);
      });
      return;
    }

    // Only process main channel messages (not threads)
    if (!newMessage.channel.isThread()) {
      void handleMessageUpdate(oldMessage as Message, newMessage as Message);
    }
  });

  client.on(Events.Error, (error) => {
    console.error("Discord client error:", error);
  });

  return client;
}
