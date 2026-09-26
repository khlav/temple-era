import { formatEasternDateTime } from "~/lib/raid-formatting";
import type { RaidZone } from "~/lib/raid-zones";
import { logger } from "~/lib/logger";
import { parseZonesFromEventTitle } from "~/lib/softres-doubleheader-parser";
import { fetchEventDetail, fetchScheduledEvents } from "~/server/services/raid-helper-client";

// A raid posted a while ago is not a candidate for a token someone is pasting now, and every
// candidate costs a Raid Helper detail fetch — so keep the window and the fan-out small.
const LOOKBACK_SECONDS = 12 * 60 * 60;
const LOOKAHEAD_SECONDS = 14 * 24 * 60 * 60;
const MAX_CANDIDATES = 5;

export interface ZoneEventMatch {
  eventId: string;
  title: string;
  /** Raid Helper's `startTime`, unix seconds. */
  timestamp: number;
  channelId: string | undefined;
  softresId: string | undefined;
}

/**
 * Upcoming Raid Helper events whose title (or channel) names `zone`, soonest first — the only
 * place a raid night's date and time exist, since SoftRes carries none for most SRs. Optionally
 * narrowed to one Eastern-time day (`YYYY-MM-DD`). Shared by `resolve-softres-event` (the bot's
 * token-block prompt) and Templar's create-SR, so both agree on what "the Naxx raid" is.
 */
export async function findEventsForZone(
  zone: RaidZone,
  dateHint?: string,
): Promise<ZoneEventMatch[]> {
  const now = Math.floor(Date.now() / 1000);
  const inWindow = (await fetchScheduledEvents())
    .filter((e) => e.startTime >= now - LOOKBACK_SECONDS && e.startTime <= now + LOOKAHEAD_SECONDS)
    .filter(
      (e) =>
        !dateHint || formatEasternDateTime(new Date(e.startTime * 1000), "yyyy-MM-dd") === dateHint,
    )
    .sort((a, b) => a.startTime - b.startTime);

  // The list has no titles; a zone match needs each event's detail. Fetched one by one and a
  // failure skips that event rather than the whole lookup.
  const matches: ZoneEventMatch[] = [];
  for (const posted of inWindow) {
    if (matches.length >= MAX_CANDIDATES) break;
    try {
      const detail = await fetchEventDetail(posted.id);
      const title = detail.displayTitle ?? detail.title ?? "Raid";
      if (parseZonesFromEventTitle(title, detail.channelName).includes(zone)) {
        matches.push({
          eventId: posted.id,
          title,
          timestamp: detail.startTime,
          channelId: detail.channelId,
          softresId: detail.softresId,
        });
      }
    } catch (error) {
      logger.warn(
        { eventId: posted.id, error: error instanceof Error ? error.message : String(error) },
        "Skipping Raid Helper event in zone lookup",
      );
    }
  }
  return matches;
}
