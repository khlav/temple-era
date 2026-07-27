import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

interface PermissionCheckResult {
  success: boolean;
  hasAccount: boolean;
  isRaidManager: boolean;
  error?: string; // Optional error message when success = false
  statusCode?: number; // Optional HTTP status code
}

export async function checkUserPermissions(
  discordUserId: string
): Promise<PermissionCheckResult> {
  try {
    const response = await fetch(
      `${config.apiBaseUrl}/api/discord/check-permissions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.templeWebApiToken}`,
        },
        body: JSON.stringify({ discordUserId }),
      }
    );

    if (!response.ok) {
      logger.error("API error checking user permissions", {
        endpoint: "/api/discord/check-permissions",
        userId: discordUserId,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      });
      return {
        success: false,
        hasAccount: false,
        isRaidManager: false,
        error: `HTTP ${response.status}`,
        statusCode: response.status,
      };
    }

    const result = await response.json();
    return {
      success: true,
      hasAccount: result.hasAccount,
      isRaidManager: result.isRaidManager,
    };
  } catch (error) {
    logger.error("Error checking user permissions", {
      endpoint: "/api/discord/check-permissions",
      userId: discordUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      hasAccount: false,
      isRaidManager: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
