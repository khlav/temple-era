import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config/env';
import { handleMessage } from './handlers/messageHandler';

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
  });

  client.on(Events.MessageCreate, handleMessage);

  client.on(Events.Error, (error) => {
    console.error('Discord client error:', error);
  });

  return client;
}
