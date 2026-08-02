import {
  CheckPermissionsResponseSchema,
  RAIDLOG_MANAGE_SCOPE,
  type CheckPermissionsResponse,
} from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

export interface PermissionCheckResult {
  success: boolean;
  hasAccount: boolean;
  /**
   * Whether the user holds `raidlog:manage` — the scope every `/api/discord/*` write route
   * actually enforces.
   *
   * Replaces the old `isRaidManager` flag, which the web app derives from "holds ANY
   * raid-manager-ish scope" and is therefore broader than the real gate: a user with only
   * `character:manage` read as a raid manager here and was then rejected by create-raid, which
   * the bot logged as a raid-creation failure rather than a permission problem.
   */
  canManageRaidLogs: boolean;
  error?: string; // Optional error message when success = false
  statusCode?: number; // Optional HTTP status code
}

/**
 * `scopes` is absent when this bot build is talking to a web build that predates it. The two
 * apps deploy from the same merge but through different pipelines (Northflank vs Vercel), so
 * there is a window where they disagree; falling back to the legacy flag beats locking every
 * raid manager out for the length of a deploy. Removed together with `isRaidManager` itself —
 * see docs/followups/legacy-access-booleans-cleanup.md.
 */
function resolveCanManageRaidLogs(response: CheckPermissionsResponse): boolean {
  if (response.scopes) {
    return response.scopes.includes(RAIDLOG_MANAGE_SCOPE);
  }
  return response.isRaidManager;
}

export async function checkUserPermissions(discordUserId: string): Promise<PermissionCheckResult> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/discord/check-permissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.templeWebApiToken}`,
      },
      body: JSON.stringify({ discordUserId }),
    });

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
        canManageRaidLogs: false,
        error: `HTTP ${response.status}`,
        statusCode: response.status,
      };
    }

    const parsed = CheckPermissionsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.error("Unexpected response shape from check-permissions", {
        endpoint: "/api/discord/check-permissions",
        userId: discordUserId,
        statusCode: response.status,
        error: parsed.error.message,
      });
      return {
        success: false,
        hasAccount: false,
        canManageRaidLogs: false,
        error: "Malformed check-permissions response",
        statusCode: response.status,
      };
    }

    return {
      success: true,
      hasAccount: parsed.data.hasAccount,
      canManageRaidLogs: resolveCanManageRaidLogs(parsed.data),
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
      canManageRaidLogs: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
