import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as schema from "~/server/db/schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn =
  globalForDb.conn ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: 10,
    connect_timeout: 10,
    max_lifetime: 60 * 5,
    // Close a pooled connection after 20s idle. This was 0 — meaning "never close" —
    // which is the root cause of idle Supavisor backends accumulating: on Vercel each
    // serverless instance holds up to `max` connections, and when the instance is
    // frozen or reclaimed those sockets are not closed cleanly, so the backend lingers
    // server-side until something reaps it. Closing them client-side while the instance
    // is still alive means far fewer are ever orphaned.
    idle_timeout: 20,
    // Skip postgres-js's pg_type lookup on every new connection. Connections churn constantly
    // here (serverless instances + idle_timeout above), and that lookup returns ~400 rows each
    // time — it was the single largest query by rows in pg_stat_statements, ~60% of everything
    // returned (TEMPLE-151). The cost: Postgres arrays arrive as raw strings like "{1,2}". Typed
    // Drizzle array columns still parse (Drizzle handles the string itself), but a raw
    // sql<T[]> expression does not — aggregate with json_agg, never array_agg.
    fetch_types: false,
  });
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
