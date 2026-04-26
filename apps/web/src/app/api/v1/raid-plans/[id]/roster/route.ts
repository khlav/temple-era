import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans, raidPlanCharacters } from "~/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const parsed = RosterPatchSchema.safeParse(body);
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
    const planCharacterIds = items.map((i) => i.planCharacterId);

    // Fetch only the planCharacters that belong to this plan
    const validCharacters = await db
      .select({ id: raidPlanCharacters.id })
      .from(raidPlanCharacters)
      .where(
        and(
          eq(raidPlanCharacters.raidPlanId, id),
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
