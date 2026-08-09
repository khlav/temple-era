/**
 * Shared client for fetching raid data from the SoftRes API.
 * Used by both the softres router (SoftRes Scan) and the raid-helper router
 * (SoftRes Links column on the Upcoming Events dashboard widget).
 */

import { TRPCError } from "@trpc/server";
import type { SoftResRaidData } from "~/server/api/interfaces/softres";
import { getClassNameBySpecId } from "~/lib/class-specs";

/**
 * Raw shape of `GET https://softres.it/api/raid/{id}`, trimmed to the fields
 * this client actually reads. SoftRes's real API predates and differs
 * substantially from the shape `SoftResRaidData` used to assume (no
 * top-level `instance`, `instances` is an array of zone objects rather than
 * plain id strings, reserves don't carry a class name, etc.) - this type
 * documents what's actually there so the mapping below stays honest.
 */
interface SoftResApiRaidResponse {
  id: string;
  raid_date: number; // Unix seconds
  instances?: Array<{ slug: string }>;
  reserves?: Array<{
    name: string;
    spec: number;
    items: number[];
    note: string | null;
  }>;
}

/**
 * Fetch SoftRes raid data from the API and normalize it to `SoftResRaidData`.
 */
export async function fetchSoftResRaidData(raidId: string): Promise<SoftResRaidData> {
  const response = await fetch(`https://softres.it/api/raid/${raidId}`);

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

  const raw = (await response.json()) as SoftResApiRaidResponse;

  const instances = (raw.instances ?? []).map((i) => i.slug);

  return {
    raidId: raw.id,
    instance: instances[0] ?? null,
    instances,
    raidDate: new Date(raw.raid_date * 1000).toISOString(),
    reserved: (raw.reserves ?? []).map((r) => ({
      name: r.name,
      class: getClassNameBySpecId(r.spec) ?? "Unknown",
      spec: r.spec,
      items: r.items,
      note: r.note ?? null,
    })),
  };
}
