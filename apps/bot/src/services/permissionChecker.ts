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
 * `scopes` is still typed optional in the contract (the deploy-skew window between web and
 * bot pipelines), but the web route has sent it unconditionally since it shipped, so the
 * `isRaidManager` fallback was dead code and has been removed. `?? []` is only a type-level
 * guard, not a real fallback path — see docs/followups/legacy-access-booleans-cleanup.md for
 * the remaining step (dropping `isRaidManager` from the schema/response itself).
 */
function resolveCanManageRaidLogs(response: CheckPermissionsResponse): boolean {
  return (response.scopes ?? []).includes(RAIDLOG_MANAGE_SCOPE);
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
      logger.error(
        {
          endpoint: "/api/discord/check-permissions",
          userId: discordUserId,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
        },
        "API error checking user permissions",
      );
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
      logger.error(
        {
          endpoint: "/api/discord/check-permissions",
          userId: discordUserId,
          statusCode: response.status,
          error: parsed.error.message,
        },
        "Unexpected response shape from check-permissions",
      );
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
    logger.error(
      {
        endpoint: "/api/discord/check-permissions",
        userId: discordUserId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error checking user permissions",
    );
    return {
      success: false,
      hasAccount: false,
      canManageRaidLogs: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
