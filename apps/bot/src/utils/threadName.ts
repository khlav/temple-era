/** Discord's hard limit on a channel or thread name. Exceeding it fails the call with a 50035. */
export const THREAD_NAME_MAX_LENGTH = 100;

/**
 * The thread name for a raid, clamped to what Discord accepts.
 *
 * The label is either the raid's name or the Warcraft Logs report title, and the report title is
 * whoever-uploaded-it's free text. An over-long one would fail `startThread`/`setName`, leaving the
 * raid lead with no thread and no message — the very failure the pending-log path exists to
 * prevent.
 */
export function raidThreadName(label: string): string {
  return `Raid: ${label}`.slice(0, THREAD_NAME_MAX_LENGTH);
}
