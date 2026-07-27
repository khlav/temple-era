import { type Config } from "drizzle-kit";

import { env } from "~/env";

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Schema operations need a session-mode connection: Supavisor's transaction-mode pooler
    // (DATABASE_URL) multiplexes clients onto shared backends and doesn't reliably propagate
    // session state like search_path, which can break unqualified DDL.
    url: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
  },
  // Scoped to "public" only: it's the sole schema modeled in schema.ts. "views" is deliberately
  // excluded there (managed via raw migrations, not push/generate) and "drizzle" is drizzle-kit's
  // own internal migration table — including either here makes push think they should be dropped.
  schemaFilter: ["public"],
} satisfies Config;
