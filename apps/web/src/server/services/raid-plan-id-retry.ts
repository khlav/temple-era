const MAX_ATTEMPTS = 3;

function isRaidPlanIdCollision(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const pgErr = err as { code?: unknown; constraint_name?: unknown };
  return pgErr.code === "23505" && pgErr.constraint_name === "raid_plan_pkey";
}

/**
 * Retries a raid plan creation on the (astronomically rare, ~1-in-hundreds-of-thousands
 * even at high volume) chance its nanoid PK collides with an existing plan — each retry
 * re-runs `fn` from scratch, which generates a fresh id via the schema's `$defaultFn`.
 * Any other error (including a real business-logic conflict, e.g. the raidHelperEventId
 * unique index) passes straight through, unretried.
 */
export async function withRaidPlanIdRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRaidPlanIdCollision(err) || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  // Unreachable — the loop always returns or throws.
  throw new Error("withRaidPlanIdRetry: exhausted attempts without returning or throwing");
}
