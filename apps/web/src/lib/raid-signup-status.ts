/**
 * Raid Helper encodes a signup's special status (as opposed to an actual class name)
 * in the `className` field of each signup entry — see the `specialStatuses` check in
 * `~/server/api/routers/raid-helper.ts`. Anything not in this set is a real class
 * signup and counts as confirmed.
 */
export const BENCH_SIGNUP_CLASS_NAME = "Bench";
export const ABSENT_SIGNUP_CLASS_NAMES = new Set(["Absence", "Absent"]);

export interface SignupCountBreakdown {
  confirmed: number;
  bench: number;
}

/**
 * Splits raw Raid Helper signups into confirmed vs bench counts (TEMPLE-95). Absent
 * signups are dropped entirely — they shouldn't inflate either bucket.
 */
export function summarizeSignupCounts(signups: Array<{ className: string }>): SignupCountBreakdown {
  let confirmed = 0;
  let bench = 0;

  for (const signup of signups) {
    if (ABSENT_SIGNUP_CLASS_NAMES.has(signup.className)) continue;
    if (signup.className === BENCH_SIGNUP_CLASS_NAME) {
      bench++;
    } else {
      confirmed++;
    }
  }

  return { confirmed, bench };
}
