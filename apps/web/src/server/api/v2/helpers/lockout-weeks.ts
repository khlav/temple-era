// src/server/api/v2/helpers/lockout-weeks.ts
import { getEasternNow } from "~/lib/raid-formatting";

export type LockoutWeek = {
  start: Date; // Tuesday 00:00:00 UTC (inclusive)
  end: Date; // next Tuesday 00:00:00 UTC (exclusive)
  isCurrentWeek: boolean;
};

/**
 * Returns the Tuesday-anchored lockout week start for a given date.
 * Matches SQL: date_trunc('week', date - 1) + INTERVAL '1 day'
 */
export function getTuesdayAnchoredWeekStart(date: Date): Date {
  // Shift back 1 day so Tuesday becomes Monday (ISO week start)
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() - 1);
  // Truncate to Monday
  const day = shifted.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue...
  const daysToMon = day === 0 ? -6 : 1 - day;
  shifted.setUTCDate(shifted.getUTCDate() + daysToMon);
  shifted.setUTCHours(0, 0, 0, 0);
  // Add 1 day → Tuesday
  shifted.setUTCDate(shifted.getUTCDate() + 1);
  return shifted;
}

/**
 * Returns an ordered array of lockout weeks going back `weeksBack` complete weeks
 * from now, optionally including the current (incomplete) week.
 * Oldest week first.
 */
export function getLockoutWeeks(weeksBack: number, includeCurrentWeek: boolean): LockoutWeek[] {
  const now = getEasternNow();
  const currentWeekStart = getTuesdayAnchoredWeekStart(now);
  const weeks: LockoutWeek[] = [];

  // Past complete weeks (oldest first)
  for (let i = weeksBack; i >= 1; i--) {
    const start = new Date(currentWeekStart);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    weeks.push({ start, end, isCurrentWeek: false });
  }

  // Current (incomplete) week
  if (includeCurrentWeek) {
    const end = new Date(currentWeekStart);
    end.setUTCDate(end.getUTCDate() + 7);
    weeks.push({ start: currentWeekStart, end, isCurrentWeek: true });
  }

  return weeks;
}
