import { randomUUID } from "node:crypto";
import diagnosticsChannel from "node:diagnostics_channel";
import type { Socket } from "node:net";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import { logger } from "~/lib/logger";
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

// TEMPORARY (TEMPLE-160): log each new TCP connection to the database, to measure how many
// connections Vercel opens per day. Each costs ~4 KB of egress, and pg_stat_statements can't
// count them (pgbouncer.get_auth does not fire per client connection). Node's diagnostics
// channel sees every socket, including postgres-js reconnects after idle_timeout, without
// touching the client. Subscribed once per process: Next loads this module in more than one
// bundle, and a second subscriber would log every connection twice. Remove once measured.
const dbConnLog = globalThis as unknown as { dbConnLogInstalled?: boolean };
// The build runs with a placeholder DATABASE_URL, so an unparseable URL skips the logging
// rather than failing the module load.
const dbPort = (() => {
  try {
    return Number(new URL(env.DATABASE_URL).port || 5432);
  } catch {
    return null;
  }
})();
if (env.NODE_ENV === "production" && dbPort !== null && !dbConnLog.dbConnLogInstalled) {
  dbConnLog.dbConnLogInstalled = true;
  const instance = randomUUID().slice(0, 8);
  let opened = 0;
  diagnosticsChannel.subscribe("net.client.socket", (message) => {
    const { socket } = message as { socket: Socket };
    socket.once("connect", () => {
      if (socket.remotePort !== dbPort) return;
      opened += 1;
      logger.info({ instance, opened, uptimeS: Math.round(process.uptime()) }, "db-conn opened");
    });
  });
}

export const db = drizzle(conn, { schema });
