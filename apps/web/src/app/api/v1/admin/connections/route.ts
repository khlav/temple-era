import { NextResponse } from "next/server";

import { logger } from "~/lib/logger";
import { SCOPE } from "~/lib/scopes";
import { validateApiToken } from "~/server/api/v1-auth";
import { killIdleConnections } from "~/server/db/kill-idle-connections";

/**
 * Terminates idle Supavisor backends on demand.
 *
 * The same cleanup runs automatically on every deploy via `pnpm db:deploy`. This
 * exists for the gap between deploys, when idle backends accumulate with nothing
 * to reap them.
 *
 * Gated on `userpermissions:manage` — the closest existing scope to an operator
 * grant. There is no dedicated ops scope, and adding one means a Postgres enum
 * migration, which is not worth it for a single endpoint.
 */
export async function POST(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.USERPERMISSIONS_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const terminated = await killIdleConnections();
    logger.info({ terminated, userId: user.id }, "Idle Supavisor connections terminated");

    return NextResponse.json({ terminated });
  } catch (error) {
    logger.error({ error }, "Failed to terminate idle connections");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
