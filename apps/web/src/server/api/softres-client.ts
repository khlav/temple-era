/**
 * Shared client for fetching raid data from the SoftRes API.
 * Used by both the softres router (SoftRes Scan) and the raid-helper router
 * (SoftRes Links column on the Upcoming Events dashboard widget).
 */

import { TRPCError } from "@trpc/server";
import type { SoftResRaidData } from "~/server/api/interfaces/softres";

/**
 * Fetch SoftRes raid data from the API
 */
export async function fetchSoftResRaidData(raidId: string): Promise<SoftResRaidData> {
  // softres.it/raid/{id} 302-redirects here for the actual raid data; the bare
  // API path on the main domain returns a plain 404 rather than redirecting.
  const response = await fetch(`https://legacy.softres.it/api/raid/${raidId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `SoftRes raid with ID "${raidId}" not found`,
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch SoftRes data: ${response.statusText}`,
    });
  }

  return (await response.json()) as SoftResRaidData;
}
