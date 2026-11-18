import { CreateRaidResponseSchema, type CreateRaidRequest } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * One `POST /api/discord/create-raid` call, parsed. Lives here rather than in the message handler
 * because the pending-log retry loop makes exactly the same call on a timer — see
 * `pendingLogRetry.ts`.
 */
export type RaidCreationOutcome =
  | { kind: "created"; raidId?: number; raidName?: string; raidUrl: string; isNew: boolean }
  /** Warcraft Logs has no encounter data yet. The same call will work later. */
  | { kind: "incomplete"; reportTitle?: string }
  /** A real failure, or a response we could not read. Retrying will not help. */
  | { kind: "failed"; error: string };

export async function requestRaidCreation(
  body: CreateRaidRequest,
  context: Record<string, unknown> = {},
): Promise<RaidCreationOutcome> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/discord/create-raid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.templeWebApiToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ ...context, error: message }, "create-raid request failed");
    return { kind: "failed", error: message };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logger.warn(
      { ...context, endpoint: "/api/discord/create-raid", statusCode: response.status },
      "API endpoint not available yet",
    );
    return { kind: "failed", error: "Temple API did not return a readable response" };
  }

  const parsed = CreateRaidResponseSchema.safeParse(payload);
  if (!parsed.success) {
    logger.error(
      {
        ...context,
        endpoint: "/api/discord/create-raid",
        statusCode: response.status,
        error: parsed.error.message,
      },
      "Unexpected response shape from create-raid",
    );
    return { kind: "failed", error: "Temple API returned an unexpected response" };
  }

  const result = parsed.data;

  if ("success" in result && result.success) {
    return {
      kind: "created",
      raidId: result.raidId,
      raidName: result.raidName,
      raidUrl: result.raidUrl,
      isNew: result.isNew,
    };
  }

  if ("logIncomplete" in result && result.logIncomplete) {
    return {
      kind: "incomplete",
      ...(result.reportTitle ? { reportTitle: result.reportTitle } : {}),
    };
  }

  const error = "error" in result ? result.error : "Unknown error";
  return { kind: "failed", error };
}
