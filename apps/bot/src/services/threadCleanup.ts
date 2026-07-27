import { type Client } from "discord.js";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

export async function cleanupOldThreads(client: Client) {
  if (!config.threadCleanupEnabled) {
    logger.info("Thread cleanup is disabled via environment variable");
    return;
  }

  try {
    logger.info("Starting thread cleanup process...");

    // Get the logs channel
    const channel = await client.channels.fetch(config.discordLogsChannelId);
    if (!channel || !channel.isTextBased()) {
      logger.error("Could not find logs channel or channel is not text-based");
      return;
    }

    // Check if channel supports threads (TextChannel or NewsChannel)
    if (!("threads" in channel)) {
      logger.error("Channel does not support threads");
      return;
    }

    // Fetch all threads in the channel
    const threads = await channel.threads.fetchActive();
    const archivedThreads = await channel.threads.fetchArchived();
    const allThreads = [
      ...threads.threads.values(),
      ...archivedThreads.threads.values(),
    ];

    logger.info(`Found ${allThreads.length} total threads in logs channel`);

    // Filter for bot-created threads
    const botThreads = allThreads.filter((thread) => {
      return thread.ownerId === client.user?.id;
    });

    logger.info(`Found ${botThreads.length} bot-created threads`);

    // Calculate cutoff time (3 days ago in milliseconds)
    const cutoffTime =
      Date.now() - config.threadCleanupDays * 24 * 60 * 60 * 1000;

    // Filter for threads older than the cutoff
    const oldThreads = botThreads.filter((thread) => {
      return thread.createdTimestamp && thread.createdTimestamp < cutoffTime;
    });

    logger.info(
      `Found ${oldThreads.length} threads older than ${config.threadCleanupDays} days`
    );

    if (oldThreads.length === 0) {
      logger.info("No old threads to clean up");
      return;
    }

    // Delete old threads
    let deletedCount = 0;
    for (const thread of oldThreads) {
      try {
        const threadName = thread.name;
        const createdDate = thread.createdTimestamp
          ? new Date(thread.createdTimestamp).toISOString()
          : "unknown";

        await thread.delete();
        deletedCount++;

        logger.info(
          `Deleted thread: "${threadName}" (created: ${createdDate})`
        );
      } catch (error) {
        logger.error(`Failed to delete thread "${thread.name}":`, error);
      }
    }

    logger.info(
      `Thread cleanup completed: ${deletedCount}/${oldThreads.length} threads deleted`
    );
  } catch (error) {
    logger.error("Thread cleanup failed:", error);
  }
}
