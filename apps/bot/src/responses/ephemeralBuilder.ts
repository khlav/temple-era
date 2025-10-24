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
    content: 'To create raid entries, you need to log in to templeashkandi.com first',
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
    content: 'You need Raid Manager permissions to create raid entries. Please contact an admin on templeashkandi.com',
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
    content: 'Click here to create a new Raid log entry on templeashkandi.com',
    components: [row],
    ephemeral: true,
  };
}
