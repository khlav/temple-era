import postgres from "postgres";

import { env } from "~/env";

/**
 * Terminates idle Supavisor backends that Supabase occasionally fails to reap.
 * Returns the number terminated.
 *
 * Opens its own short-lived connection rather than reusing the app pool: killing
 * Supavisor backends from inside the Supavisor pool means the caller's own backend is
 * a candidate, surviving only via the `pg_backend_pid()` filter. A dedicated
 * session-mode connection keeps that filter from being load-bearing, and avoids
 * holding an app-pool slot for the duration.
 *
 * Deliberately never touches:
 *  - `active` connections — live queries, including in-flight app traffic
 *  - other `application_name`s — `postgrest`, `postgres_exporter`,
 *    `Supabase Storage API`, `pg_cron`, and unnamed platform connections
 *    (`show archive_mode;`, `pgbouncer.get_auth`) all belong to Supabase itself
 */
export async function killIdleConnections(): Promise<number> {
  const url = env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL;
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });

  try {
    // Matches scripts/db/kill-idle-connections.mjs. Broader than plain `idle`:
    // `idle in transaction` is strictly worse, since it can still hold locks.
    const terminated = await sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where application_name = 'Supavisor'
        and state in ('idle', 'idle in transaction', 'idle in transaction (aborted)')
        and pid <> pg_backend_pid()
    `;
    return terminated.length;
  } finally {
    await sql.end();
  }
}
