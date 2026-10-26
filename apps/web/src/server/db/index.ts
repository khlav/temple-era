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
    // Every new connection costs ~4 KB of egress before its first query (TLS handshake measured
    // at 3.5 KB on the pooler, plus Postgres startup and auth). With a 20s idle timeout and
    // 5-minute lifetime, the app opened ~5,000 a day, about one per request: ~20 MB/day, ~18%
    // of all egress (TEMPLE-157). So connections now live longer and survive gaps between
    // requests.
    max_lifetime: 60 * 30,
    // Close a pooled connection after 2 minutes idle. This was once 0 — meaning "never close" —
    // which let idle Supavisor backends accumulate: on Vercel each serverless instance holds
    // up to `max` connections, and when the instance is frozen or reclaimed those sockets are
    // not closed cleanly, so the backend lingers server-side until something reaps it. A
    // bounded timeout still closes them while the instance is alive. It was then 20s, which
    // also closed connections between ordinary requests; see max_lifetime above.
    idle_timeout: 120,
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
