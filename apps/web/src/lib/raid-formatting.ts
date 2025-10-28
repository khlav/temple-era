/**
 * Utility functions for formatting raid information consistently across the app
 */

import { formatInTimeZone } from "date-fns-tz";

/**
 * Converts a UTC date to Eastern Time date string (YYYY-MM-DD format)
 * Handles daylight saving time automatically (EST/EDT)
 * @param utcDate - UTC date to convert
 * @returns Eastern Time date string in YYYY-MM-DD format
 */
export function getEasternDate(utcDate: Date): string {
  return formatInTimeZone(utcDate, "America/New_York", "yyyy-MM-dd");
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
