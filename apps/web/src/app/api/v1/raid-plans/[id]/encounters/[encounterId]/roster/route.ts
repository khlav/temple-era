import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
} from "~/server/db/schema";
import { and, eq } from "drizzle-orm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EncounterRosterPatchSchema = z
  .array(
    z.object({
      planCharacterId: z.string().uuid(),
      group: z.number().int().min(0).max(7).nullable(),
      position: z.number().int().min(0).max(4).nullable(),
    }),
  )
  .min(1)
  .max(200);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, encounterId } = await params;

    if (!UUID_RE.test(id) || !UUID_RE.test(encounterId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = EncounterRosterPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Verify encounter belongs to this plan
    const encounter = await db
      .select({ id: raidPlanEncounters.id })
      .from(raidPlanEncounters)
      .where(
        and(
          eq(raidPlanEncounters.id, encounterId),
          eq(raidPlanEncounters.raidPlanId, id),
        ),
      )
      .limit(1);

    if (encounter.length === 0) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const items = parsed.data;
    let updated = 0;

    // Serial upserts: update existing, insert if no row matched
    await db.transaction(async (tx) => {
      for (const item of items) {
        const result = await tx
          .update(raidPlanEncounterAssignments)
          .set({
            groupNumber: item.group,
            position: item.position,
          })
          .where(
            and(
              eq(raidPlanEncounterAssignments.encounterId, encounterId),
              eq(
                raidPlanEncounterAssignments.planCharacterId,
                item.planCharacterId,
              ),
            ),
          )
          .returning({ id: raidPlanEncounterAssignments.id });

        if (result.length === 0) {
          await tx.insert(raidPlanEncounterAssignments).values({
            encounterId,
            planCharacterId: item.planCharacterId,
            groupNumber: item.group,
            position: item.position,
          });
        }
        updated++;
      }
    });

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
