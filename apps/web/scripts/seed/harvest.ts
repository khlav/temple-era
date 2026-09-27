import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * The ONLY step that reads production, and the whole reason this seed exists.
 *
 * Supabase bills data egress, which made `db:clone-prod` (a full pg_dump of every row) too
 * expensive to run routinely. This pulls just the newest raid log *identifiers* — ~25 rows of
 * short strings, a few KB — and the actual roster/fight payloads are then fetched from the
 * Warcraft Logs API instead, which costs us nothing. That is the entire trick: prod supplies the
 * "which raids", WCL supplies the "what happened".
 *
 * The result is cached on disk so re-seeding never re-queries prod at all.
 */

export interface HarvestedLog {
  raidLogId: string;
  name: string;
  zone: string | null;
  startTimeUTC: string | null;
}

// Resolved against this file, not the working directory, so the cache lands in the same place
// whether the seed is run from the repo root (`pnpm db:local:seed`) or from apps/web.
export const HARVEST_CACHE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  ".harvested-log-ids.json",
);

export async function harvestLogIds(opts: {
  count: number;
  refresh: boolean;
}): Promise<HarvestedLog[]> {
  if (!opts.refresh && existsSync(HARVEST_CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(HARVEST_CACHE_PATH, "utf8")) as HarvestedLog[];
    // Sliced, so --count still means something on a re-seed. The cache is newest-first, so this
    // takes the N most recent. Asking for more than the cache holds needs --refresh-ids; growing
    // the list is the one case that genuinely has to go back to prod.
    if (cached.length > 0) return cached.slice(0, opts.count);
  }

  const prodUrl = process.env.DATABASE_PROD_URL;
  if (!prodUrl) {
    throw new Error(
      [
        "DATABASE_PROD_URL is not set, and there is no cached ID list to fall back on.",
        "It lives in the Doppler dev_personal config — run this via `pnpm db:local:seed`,",
        "or pass --skip-harvest to seed without raid data.",
      ].join("\n"),
    );
  }

  // A short-lived connection of its own rather than the app's `db` singleton, which is bound to
  // DATABASE_URL (the local container). Same pattern as scripts/infer-primary-characters.ts.
  // max: 1 because this is one query, and prepare: false because prod is behind Supavisor's
  // transaction-mode pooler.
  const sql = postgres(prodUrl, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    // Ordered by the raid's own date where there is one (indexed, and the more meaningful notion
    // of "recent"), falling back to the log's start time for logs not yet attached to a raid.
    const rows = await sql<HarvestedLog[]>`
      select
        rl.raid_log_id    as "raidLogId",
        rl.name           as "name",
        rl.zone           as "zone",
        rl.start_time_utc as "startTimeUTC"
      from raid_log rl
      left join raid r on r.raid_id = rl.raid_id
      order by coalesce(r.date::timestamp, rl.start_time_utc) desc nulls last
      limit ${opts.count}
    `;

    const harvested = rows.map((r) => ({ ...r }));
    mkdirSync(dirname(HARVEST_CACHE_PATH), { recursive: true });
    writeFileSync(HARVEST_CACHE_PATH, JSON.stringify(harvested, null, 2) + "\n");
    return harvested;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
