import { and, eq, or } from "drizzle-orm";
import { db } from "~/server/db";
import { raidPlans } from "~/server/db/schema";
import { isLegacyRaidPlanUuid } from "~/lib/raid-plan-id";

/**
 * Resolves a raid plan ID or its legacy (pre-nanoid-migration) UUID to the plan's
 * canonical id + name, used by the canonical-URL redirect logic in the raid-plans and
 * raid-manager/raid-planner routes. Only matches against legacy_uuid when the input is
 * actually UUID-shaped — comparing an arbitrary nanoid string against the uuid-typed
 * column throws.
 */
export async function resolveRaidPlan(
  id: string,
  { publicOnly = false }: { publicOnly?: boolean } = {},
): Promise<{ id: string; name: string } | null> {
  const idCondition = isLegacyRaidPlanUuid(id)
    ? or(eq(raidPlans.id, id), eq(raidPlans.legacyUuid, id))
    : eq(raidPlans.id, id);

  const result = await db
    .select({ id: raidPlans.id, name: raidPlans.name })
    .from(raidPlans)
    .where(publicOnly ? and(idCondition, eq(raidPlans.isPublic, true)) : idCondition)
    .limit(1);

  return result[0] ?? null;
}

/**
 * Resolves a raid plan ID or legacy UUID to just its canonical id — used by the v1 REST
 * routes, which validate the request-path ID against RAID_PLAN_ID_PATTERN (accepting
 * either format) but otherwise query directly on `raidPlans.id` rather than going through
 * the tRPC router's resolution. Always verifies the plan actually exists (a well-formed
 * but nonexistent nanoid must resolve to null, same as a plain lookup miss) — several
 * callers rely on this as their only existence check before writing to child tables.
 */
export async function resolveRaidPlanCanonicalId(id: string): Promise<string | null> {
  const resolved = await resolveRaidPlan(id);
  return resolved?.id ?? null;
}
