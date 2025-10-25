import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config/env';

export function buildLoginRequiredResponse(reportId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Log in to templeashkandi.com')
        .setURL(config.apiBaseUrl)
        .setStyle(ButtonStyle.Link)
    );

  return {
    components: [row],
    ephemeral: true,
  };
}

export function buildPermissionRequiredResponse() {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('View your profile')
        .setURL(`${config.apiBaseUrl}/profile`)
        .setStyle(ButtonStyle.Link)
    );

  return {
    components: [row],
    ephemeral: true,
  };
}

export function buildRaidCreationResponse(reportId: string) {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Create Raid Entry')
        .setURL(`${config.apiBaseUrl}/raids/new?wcl=${reportId}`)
        .setStyle(ButtonStyle.Link)
    );

  return {
    components: [row],
    ephemeral: true,
  };
}
