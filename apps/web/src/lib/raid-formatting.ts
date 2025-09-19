/**
 * Utility functions for formatting raid information consistently across the app
 */

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
