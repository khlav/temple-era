import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const ET_TIMEZONE = "America/New_York";

/**
 * Formats a date to "Tue, September 11, 2025 @ 8pm" (or "8:30pm") in ET timezone.
 *
 * @param date - The date to format
 * @returns The formatted date string
 */
/**
 * Formats a date to "Tue, Sep 11" in ET timezone.
 */
export function formatRaidDay(
  date: Date | string | number | null | undefined,
): string {
  if (!date) return "";
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return "";
  const zonedDate = toZonedTime(dateObj, ET_TIMEZONE);
  return format(zonedDate, "EEE, MMM d");
}

/**
 * Formats a time to "8pm" or "8:30pm" in ET timezone.
 */
export function formatRaidTime(
  date: Date | string | number | null | undefined,
): string {
  if (!date) return "";
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return "";
  const zonedDate = toZonedTime(dateObj, ET_TIMEZONE);

  const minutes = format(zonedDate, "m");
  const timeFormat = minutes === "0" ? "ha" : "h:mma";
  return format(zonedDate, timeFormat).toLowerCase();
}

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
  const timePart = formatRaidTime(zonedDate);

  return `${datePart} @ ${timePart}`;
}
