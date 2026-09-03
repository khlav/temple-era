import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { validateApiToken } from "~/server/api/v1-auth";
import { RAID_PLAN_ID_PATTERN } from "~/lib/raid-plan-id";
import { resolveRaidPlanCanonicalId } from "~/server/services/raid-plan-lookup";
import { db } from "~/server/db";
import { raidPlans, raidPlanCharacters } from "~/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { SCOPE } from "~/lib/scopes";

const RosterPatchSchema = z
  .array(
    z.object({
      planCharacterId: z.string().uuid(),
      group: z.number().int().min(0).max(7).nullable(),
      position: z.number().int().min(0).max(4).nullable(),
    }),
  )
  .min(1)
  .max(200);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.scopes.includes(SCOPE.RAIDPLAN_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (!RAID_PLAN_ID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = RosterPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const planId = await resolveRaidPlanCanonicalId(id);
    if (!planId) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const items = parsed.data;
    const planCharacterIds = items.map((i) => i.planCharacterId);

    // Fetch only the planCharacters that belong to this plan
    const validCharacters = await db
      .select({ id: raidPlanCharacters.id })
      .from(raidPlanCharacters)
      .where(
        and(
          eq(raidPlanCharacters.raidPlanId, planId),
          inArray(raidPlanCharacters.id, planCharacterIds),
        ),
      );

    const validIds = new Set(validCharacters.map((c) => c.id));

    let updated = 0;
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (!validIds.has(item.planCharacterId)) continue;
        await tx
          .update(raidPlanCharacters)
          .set({
            defaultGroup: item.group,
            defaultPosition: item.position,
          })
          .where(eq(raidPlanCharacters.id, item.planCharacterId));
        updated++;
      }
    });

    await db.update(raidPlans).set({ updatedById: user.id }).where(eq(raidPlans.id, planId));

    return NextResponse.json({ updated });
  } catch (error) {
    logger.error({ err: error }, "v1 API error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
