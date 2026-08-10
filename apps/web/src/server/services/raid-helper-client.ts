import { env } from "~/env";

const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

export interface RaidHelperPostedEvent {
  id: string;
  startTime: number; // unix seconds
  endTime: number;
  channelId: string;
  signUpCount?: number | string;
}

export interface RaidHelperSignup {
  userId: string;
  name: string;
  className: string;
  specName: string;
  roleName: string;
  status: string;
  position: number;
  entryTime: number;
}

export interface RaidHelperEventDetail {
  id: string; // resolved event id, post lastEventId resolution
  startTime: number;
  signUps: RaidHelperSignup[];
}

/**
 * Excludes the guild's #rh-signup-archive channel, if configured. Raid Helper's events
 * list has no server-side filter of its own and returns every event ever posted there
 * regardless of age — that one channel alone accounted for 427 of 439 events observed
 * during development (all past, dating back to Feb 2025), dwarfing the handful of
 * genuinely-scheduled events in the guild's actual per-raid-day channels. Denylisting
 * this one known channel is more robust than allowlisting the active raid-day channels,
 * since those rotate as raid tiers/schedules change.
 */
export async function fetchScheduledEvents(): Promise<RaidHelperPostedEvent[]> {
  const res = await fetch(`${RAID_HELPER_API_BASE}/v4/servers/${env.DISCORD_SERVER_ID}/events`, {
    headers: { Authorization: env.RAID_HELPER_API_KEY },
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Raid Helper events list failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { postedEvents?: RaidHelperPostedEvent[] };
  const events = data.postedEvents ?? [];

  if (!env.DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID) return events;
  return events.filter((e) => e.channelId !== env.DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID);
}

/**
 * Fetches full event detail, resolving `lastEventId` for recurring/channel events whose
 * initial response has no `signUps` — same quirk handled independently in
 * raid-helper.ts:getEventDetails and the v1 scheduled-raids signups route.
 */
export async function fetchEventDetail(eventId: string): Promise<RaidHelperEventDetail> {
  const initialRes = await fetch(`${RAID_HELPER_API_BASE}/v4/events/${eventId}`, {
    headers: { Authorization: env.RAID_HELPER_API_KEY },
  });
  if (!initialRes.ok) {
    throw new Error(`Raid Helper event ${eventId} fetch failed: ${initialRes.status}`);
  }
  const initialData = (await initialRes.json()) as Record<string, unknown>;

  const actualEventId =
    !initialData.signUps && initialData.lastEventId ? (initialData.lastEventId as string) : eventId;

  if (actualEventId === eventId) {
    return initialData as unknown as RaidHelperEventDetail;
  }

  const resolvedRes = await fetch(`${RAID_HELPER_API_BASE}/v4/events/${actualEventId}`, {
    headers: { Authorization: env.RAID_HELPER_API_KEY },
  });
  if (!resolvedRes.ok) {
    throw new Error(
      `Raid Helper event ${actualEventId} (resolved from ${eventId}) fetch failed: ${resolvedRes.status}`,
    );
  }
  return (await resolvedRes.json()) as RaidHelperEventDetail;
}
