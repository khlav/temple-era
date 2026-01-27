/**
 * Utility functions for formatting raid information consistently across the app
 */

import { formatInTimeZone, toZonedTime } from "date-fns-tz";

const EASTERN_TIMEZONE = "America/New_York";

/**
 * Gets the current date/time in Eastern Time
 * Handles daylight saving time automatically (EST/EDT)
 * @returns Current date/time as a Date object in Eastern Time
 */
export function getEasternNow(): Date {
  return toZonedTime(new Date(), EASTERN_TIMEZONE);
}

/**
 * Converts any date to Eastern Time
 * Handles daylight saving time automatically (EST/EDT)
 * @param date - Date to convert
 * @returns Date object in Eastern Time
 */
export function toEasternTime(date: Date): Date {
  return toZonedTime(date, EASTERN_TIMEZONE);
}

/**
 * Converts a UTC date to Eastern Time date string (YYYY-MM-DD format)
 * Handles daylight saving time automatically (EST/EDT)
 * @param utcDate - UTC date to convert
 * @returns Eastern Time date string in YYYY-MM-DD format
 */
export function getEasternDate(utcDate: Date): string {
  return formatInTimeZone(utcDate, EASTERN_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Formats a raid date string to avoid timezone issues
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Formatted date string
 */
export function formatRaidDate(dateString: string): string {
  return new Date(dateString + "T00:00:00").toLocaleDateString();
}

/**
 * Formats raid completion information (x kills)
 * @param zone - Raid zone name
 * @param killCount - Number of bosses killed
 * @returns Formatted completion string
 */
export function formatRaidCompletion(zone: string, killCount: number): string {
  const count = Number(killCount);
  return `${count} ${count === 1 ? "kill" : "kills"}`;
}

/**
 * Formats a date/time in Eastern Time with timezone abbreviation
 * @param date - Date to format
 * @param format - date-fns format string (defaults to readable format with timezone)
 * @returns Formatted date string in Eastern Time
 */
export function formatEasternDateTime(
  date: Date,
  format = "EEE, MMM d 'at' h:mm a zzz",
): string {
  return formatInTimeZone(date, EASTERN_TIMEZONE, format);
}
