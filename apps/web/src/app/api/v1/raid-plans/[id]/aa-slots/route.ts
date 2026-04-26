import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans, raidPlanEncounterAASlots } from "~/server/db/schema";
import { and, eq, max } from "drizzle-orm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AASlotAssignRequestSchema = z
  .array(
    z.object({
      slotName: z.string().min(1).max(128),
      planCharacterId: z.string().uuid(),
      encounterId: z.string().uuid().nullable(),
    }),
  )
  .min(1)
  .max(200);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = AASlotAssignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const plan = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const items = parsed.data;
    let assigned = 0;
    let skipped = 0;

    // Serial to preserve sortOrder correctness
    for (const item of items) {
      const isEncounter = item.encounterId !== null;

      const existingCheck = isEncounter
        ? and(
            eq(raidPlanEncounterAASlots.encounterId, item.encounterId!),
            eq(raidPlanEncounterAASlots.planCharacterId, item.planCharacterId),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          )
        : and(
            eq(raidPlanEncounterAASlots.raidPlanId, id),
            eq(raidPlanEncounterAASlots.planCharacterId, item.planCharacterId),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          );

      const existing = await db
        .select({ id: raidPlanEncounterAASlots.id })
        .from(raidPlanEncounterAASlots)
        .where(existingCheck)
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const whereClause = isEncounter
        ? and(
            eq(raidPlanEncounterAASlots.encounterId, item.encounterId!),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          )
        : and(
            eq(raidPlanEncounterAASlots.raidPlanId, id),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          );

      const maxSortResult = await db
        .select({ maxSort: max(raidPlanEncounterAASlots.sortOrder) })
        .from(raidPlanEncounterAASlots)
        .where(whereClause);

      const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

      await db.insert(raidPlanEncounterAASlots).values({
        encounterId: item.encounterId ?? null,
        raidPlanId: item.encounterId ? null : id,
        planCharacterId: item.planCharacterId,
        slotName: item.slotName,
        sortOrder: nextSortOrder,
      });

      assigned++;
    }

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ assigned, skipped });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
