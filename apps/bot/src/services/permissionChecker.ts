import { config } from '../config/env.js';

interface PermissionCheckResult {
  hasAccount: boolean;
  isRaidManager: boolean;
}

export async function checkUserPermissions(
  discordUserId: string
): Promise<PermissionCheckResult> {
  try {
    const response = await fetch(
      `${config.apiBaseUrl}/api/discord/check-permissions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.templeWebApiToken}`,
        },
        body: JSON.stringify({ discordUserId }),
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error checking user permissions:', error);
    return { hasAccount: false, isRaidManager: false };
  }
}
