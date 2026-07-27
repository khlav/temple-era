#!/usr/bin/env node
// Terminates idle Supavisor backend connections that Supabase occasionally fails to reap,
// which otherwise pile up until Postgres' connection limit is hit. Runs on every deploy
// (postbuild) so the issue self-heals instead of requiring a manual SQL fix in Supabase.
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("[kill-idle-connections] DATABASE_URL not set, skipping.");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  // Deliberately excludes `active` — those are live queries (including current app traffic
  // routed through Supavisor) and must not be killed mid-deploy.
  const terminated = await sql`
    select pg_terminate_backend(pid) as terminated
    from pg_stat_activity
    where application_name = 'Supavisor'
      and state in ('idle', 'idle in transaction', 'idle in transaction (aborted)')
      and pid <> pg_backend_pid()
  `;

  console.log(`[kill-idle-connections] Terminated ${terminated.length} idle Supavisor connection(s).`);
} catch (error) {
  console.warn("[kill-idle-connections] Failed to terminate idle connections, continuing deploy:", error);
} finally {
  await sql.end();
}
