import { CreateRaidResponseSchema, type CreateRaidRequest } from "@temple-era/contracts";
import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

/** A create-raid call that has not answered in this long is treated as a retryable failure. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * One `POST /api/discord/create-raid` call, parsed. Lives here rather than in the message handler
 * because the pending-log retry loop makes exactly the same call on a timer — see
 * `pendingLogRetry.ts`.
 */
export type RaidCreationOutcome =
  | { kind: "created"; raidId?: number; raidName?: string; raidUrl: string; isNew: boolean }
  /** Warcraft Logs has no encounter data yet. The same call will work later. */
  | { kind: "incomplete"; reportTitle?: string }
  /**
   * A failure. `retryable` separates "Temple was unreachable just then" — a DNS blip, a connection
   * reset, the web app mid-deploy — from a deterministic refusal like a missing permission. The
   * retry loop keeps waiting on the first and stops on the second; treating both as terminal threw
   * away the rest of the hour over a few seconds of unavailability.
   */
  | { kind: "failed"; error: string; retryable: boolean };

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
      // Without this a stalled request never settles, and the retry chain only advances when it
      // does — the thread would keep its "I'll check back" message forever.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ ...context, error: message }, "create-raid request failed");
    return { kind: "failed", error: message, retryable: true };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logger.warn(
      { ...context, endpoint: "/api/discord/create-raid", statusCode: response.status },
      "API endpoint not available yet",
    );
    // Typically a proxy's HTML error page while the web app redeploys — worth another attempt.
    return {
      kind: "failed",
      error: "Temple API did not return a readable response",
      retryable: true,
    };
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
    // A body that parses as JSON but not as the contract is a contract problem, not a blip.
    return {
      kind: "failed",
      error: "Temple API returned an unexpected response",
      retryable: false,
    };
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

  // A refusal the route meant to send — a missing permission, an unusable URL. Deterministic, so
  // the same call will refuse again.
  const error = "error" in result ? result.error : "Unknown error";
  return { kind: "failed", error, retryable: false };
}
