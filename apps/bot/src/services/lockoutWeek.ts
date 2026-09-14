const EASTERN_TIME_ZONE = "America/New_York";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getEasternDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

/**
 * The Tuesday-anchored lockout week (Tue -> Mon, ET calendar day) a given instant falls in,
 * as "YYYY-MM-DD" of that Tuesday. Mirrors apps/web's `getTuesdayAnchoredWeekStart`
 * (apps/web/src/lib/lockout-weeks.ts) but reads the ET calendar date via Intl instead of
 * date-fns-tz, since that's an apps/web-only dependency — this only needs the calendar day,
 * not full timezone-aware Date arithmetic. Noon UTC avoids any DST-edge date-shifting when
 * rebuilding a Date from the extracted Y/M/D.
 */
export function getLockoutWeekKey(date: Date): string {
  const { year, month, day, weekday } = getEasternDateParts(date);
  const daysSinceTuesday = (WEEKDAY_INDEX[weekday]! - 2 + 7) % 7;
  const tuesday = new Date(Date.UTC(year, month - 1, day, 12));
  tuesday.setUTCDate(tuesday.getUTCDate() - daysSinceTuesday);
  return tuesday.toISOString().slice(0, 10);
}

/** "Sep 8" from a `getLockoutWeekKey` result, for the embed title. */
export function formatLockoutWeekLabel(weekKey: string): string {
  const [year, month, day] = weekKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(date);
}
