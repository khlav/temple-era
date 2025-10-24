import { Message } from 'discord.js';
import { config } from '../config/env';
import { extractWarcraftLogsUrls, extractReportId } from '../services/wclDetector';
import { checkUserPermissions } from '../services/permissionChecker';
import {
  buildLoginRequiredResponse,
  buildPermissionRequiredResponse,
  buildRaidCreationResponse,
} from '../responses/ephemeralBuilder';

export async function handleMessage(message: Message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in the target channel
  if (message.channelId !== config.discordLogsChannelId) return;

  // Extract WCL URLs
  const wclUrls = extractWarcraftLogsUrls(message.content);
  if (wclUrls.length === 0) return;

  // Get first WCL URL and extract report ID
  const firstUrl = wclUrls[0];
  const reportId = extractReportId(firstUrl);
  if (!reportId) return;

  // Check user permissions
  const { hasAccount, isRaidManager } = await checkUserPermissions(message.author.id);

  // Build appropriate response
  let response;
  if (!hasAccount) {
    response = buildLoginRequiredResponse(reportId);
  } else if (!isRaidManager) {
    response = buildPermissionRequiredResponse();
  } else {
    response = buildRaidCreationResponse(reportId);
  }

  // Send ephemeral reply
  try {
    await message.reply(response);
  } catch (error) {
    console.error('Error sending reply:', error);
  }
}
