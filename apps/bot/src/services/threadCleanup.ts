import { type Client } from "discord.js";
import { config } from "../config/env.js";

export async function cleanupOldThreads(client: Client) {
  if (!config.threadCleanupEnabled) {
    console.log("🧹 Thread cleanup is disabled via environment variable");
    return;
  }

  try {
    console.log("🧹 Starting thread cleanup process...");

    // Get the logs channel
    const channel = await client.channels.fetch(config.discordLogsChannelId);
    if (!channel || !channel.isTextBased()) {
      console.error(
        "❌ Could not find logs channel or channel is not text-based"
      );
      return;
    }

    // Check if channel supports threads (TextChannel or NewsChannel)
    if (!("threads" in channel)) {
      console.error("❌ Channel does not support threads");
      return;
    }

    // Fetch all threads in the channel
    const threads = await channel.threads.fetchActive();
    const archivedThreads = await channel.threads.fetchArchived();
    const allThreads = [
      ...threads.threads.values(),
      ...archivedThreads.threads.values(),
    ];

    console.log(`📊 Found ${allThreads.length} total threads in logs channel`);

    // Filter for bot-created threads
    const botThreads = allThreads.filter((thread) => {
      return thread.ownerId === client.user?.id;
    });

    console.log(`🤖 Found ${botThreads.length} bot-created threads`);

    // Calculate cutoff time (3 days ago in milliseconds)
    const cutoffTime =
      Date.now() - config.threadCleanupDays * 24 * 60 * 60 * 1000;

    // Filter for threads older than the cutoff
    const oldThreads = botThreads.filter((thread) => {
      return thread.createdTimestamp && thread.createdTimestamp < cutoffTime;
    });

    console.log(
      `⏰ Found ${oldThreads.length} threads older than ${config.threadCleanupDays} days`
    );

    if (oldThreads.length === 0) {
      console.log("✅ No old threads to clean up");
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

        console.log(
          `🗑️ Deleted thread: "${threadName}" (created: ${createdDate})`
        );
      } catch (error) {
        console.error(`❌ Failed to delete thread "${thread.name}":`, error);
      }
    }

    console.log(
      `✅ Thread cleanup completed: ${deletedCount}/${oldThreads.length} threads deleted`
    );
  } catch (error) {
    console.error("❌ Thread cleanup failed:", error);
  }
}
