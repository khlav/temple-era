// Pure date math for the "+ Schedule" dialog's default day/time — kept framework-agnostic (no
// React, no tRPC types) so the fiddly calendar/timezone logic is unit-testable on its own.
import { addDays } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The next Tuesday at hour:minute Eastern time — today if it's still Tuesday and that time
 * hasn't passed yet in ET, otherwise the following Tuesday. Calendar-day arithmetic is anchored
 * at UTC noon purely as an unambiguous scratch value (no real zone involved in the shift itself),
 * so a DST transition between now and the target date can't flip which calendar day lands on.
 */
export function nextTuesdayAtEasternTime(
  hour: number,
  minute: number,
  now: Date = new Date(),
): Date {
  const currentIsoDay = Number(formatInTimeZone(now, EASTERN_TIMEZONE, "i")); // 1=Mon...7=Sun
  const currentDateStr = formatInTimeZone(now, EASTERN_TIMEZONE, "yyyy-MM-dd");
  const currentTimeStr = formatInTimeZone(now, EASTERN_TIMEZONE, "HH:mm");
  const targetTimeStr = `${pad(hour)}:${pad(minute)}`;

  let daysUntilTuesday = (2 - currentIsoDay + 7) % 7;
  if (daysUntilTuesday === 0 && currentTimeStr >= targetTimeStr) {
    daysUntilTuesday = 7;
  }

  const anchorUtcNoon = new Date(`${currentDateStr}T12:00:00Z`);
  const targetDateStr = formatInTimeZone(
    addDays(anchorUtcNoon, daysUntilTuesday),
    "UTC",
    "yyyy-MM-dd",
  );

  return fromZonedTime(`${targetDateStr}T${pad(hour)}:${pad(minute)}:00`, EASTERN_TIMEZONE);
}

/** True if any of the given instants fall on the same Eastern calendar date as `target`. */
export function hasAssignmentOnSameEasternDate(target: Date, existing: Date[]): boolean {
  const targetDateStr = formatInTimeZone(target, EASTERN_TIMEZONE, "yyyy-MM-dd");
  return existing.some(
    (d) => formatInTimeZone(d, EASTERN_TIMEZONE, "yyyy-MM-dd") === targetDateStr,
  );
}

/**
 * The schedule dialog's day/time `<input type="datetime-local">` is deliberately treated as an
 * Eastern wall-clock field, not a browser-local one — "times are ET" has to hold regardless of
 * which timezone the raid lead filling out the form happens to be in. These two functions are
 * the only place that boundary is crossed: format an instant into what the field should *show*,
 * and parse what it submitted back into the correct UTC instant for storage. Postgres stores
 * `scheduled_at` as `timestamptz` (always UTC internally); these just control the ET<->instant
 * conversion at the edges.
 */
export function toEasternDatetimeLocalValue(date: Date): string {
  return formatInTimeZone(date, EASTERN_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

export function parseEasternDatetimeLocalValue(value: string): Date {
  return fromZonedTime(`${value}:00`, EASTERN_TIMEZONE);
}

/**
 * Default value for the schedule dialog's day/time field: the next Tuesday at the buff's
 * standing turn-in time, rolling forward a week at a time past any Tuesday that already has a
 * turn-in scheduled for that same buff, so a raid lead never lands on a stacked slot by default
 * (they can still pick one manually). `addDays(target, 1)` here is just a scratch value to push
 * the search into the following week — `nextTuesdayAtEasternTime` re-derives the real ET-correct
 * instant from it, so a DST-driven hour wobble in the scratch value doesn't matter.
 */
export function computeDefaultScheduledAt(
  hour: number,
  minute: number,
  existingScheduledAtForBuff: Date[],
  now: Date = new Date(),
): string {
  let candidateNow = now;
  let target = nextTuesdayAtEasternTime(hour, minute, candidateNow);
  let weeksChecked = 0;
  while (hasAssignmentOnSameEasternDate(target, existingScheduledAtForBuff) && weeksChecked < 52) {
    candidateNow = addDays(target, 1);
    target = nextTuesdayAtEasternTime(hour, minute, candidateNow);
    weeksChecked += 1;
  }
  return toEasternDatetimeLocalValue(target);
}
