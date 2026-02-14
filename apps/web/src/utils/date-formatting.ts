import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const ET_TIMEZONE = "America/New_York";

/**
 * Formats a date to "Tue, September 11, 2025 @ 8pm" (or "8:30pm") in ET timezone.
 *
 * @param date - The date to format
 * @returns The formatted date string
 */
export function formatRaidDate(
  date: Date | string | number | null | undefined,
): string {
  if (!date) return "";

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return "";

  const zonedDate = toZonedTime(dateObj, ET_TIMEZONE);

  // Format the date part: "Tue, September 11, 2025"
  const datePart = format(zonedDate, "EEE, MMMM d, yyyy");

  // Format the time part: "8pm" or "8:30pm"
  const minutes = format(zonedDate, "m");
  const timeFormat = minutes === "0" ? "ha" : "h:mma";
  const timePart = format(zonedDate, timeFormat).toLowerCase();

  return `${datePart} @ ${timePart}`;
}
