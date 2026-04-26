import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { getSlotNames } from "~/lib/aa-template";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,
  raidPlanCharacters,
} from "~/server/db/schema";
import { and, eq, notInArray } from "drizzle-orm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UpdateEncounterSchema = z.object({
  useDefaultGroups: z.boolean().optional(),
  encounterName: z.string().min(1).max(256).optional(),
  aaTemplate: z.string().max(10000).nullable().optional(),
  useCustomAA: z.boolean().optional(),
});

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

    const parsed = UpdateEncounterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;

    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: "No fields provided" },
        { status: 400 },
      );
    }

    // Verify encounter belongs to this plan
    const encounter = await db
      .select({
        id: raidPlanEncounters.id,
        raidPlanId: raidPlanEncounters.raidPlanId,
      })
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

    const updates: Partial<{
      useDefaultGroups: boolean;
      encounterName: string;
      encounterKey: string;
      aaTemplate: string | null;
      useCustomAA: boolean;
    }> = {};

    if (input.useDefaultGroups !== undefined)
      updates.useDefaultGroups = input.useDefaultGroups;
    if (input.encounterName !== undefined) {
      updates.encounterName = input.encounterName;
      updates.encounterKey = slugifyEncounterName(input.encounterName);
    }
    if (input.aaTemplate !== undefined) updates.aaTemplate = input.aaTemplate;
    if (input.useCustomAA !== undefined)
      updates.useCustomAA = input.useCustomAA;

    await db
      .update(raidPlanEncounters)
      .set(updates)
      .where(eq(raidPlanEncounters.id, encounterId));

    // Clean up orphaned AA slot assignments when template changes
    if (input.aaTemplate !== undefined) {
      const slotNames = input.aaTemplate ? getSlotNames(input.aaTemplate) : [];
      const conditions = [
        eq(raidPlanEncounterAASlots.encounterId, encounterId),
      ];
      if (slotNames.length > 0) {
        conditions.push(
          notInArray(raidPlanEncounterAASlots.slotName, slotNames),
        );
      }
      await db.delete(raidPlanEncounterAASlots).where(and(...conditions));
    }

    // Seed encounter assignments from defaults when toggling useDefaultGroups → false
    if (input.useDefaultGroups === false) {
      const existingAssignments = await db
        .select({ id: raidPlanEncounterAssignments.id })
        .from(raidPlanEncounterAssignments)
        .where(eq(raidPlanEncounterAssignments.encounterId, encounterId))
        .limit(1);

      if (existingAssignments.length === 0) {
        const planChars = await db
          .select({
            id: raidPlanCharacters.id,
            defaultGroup: raidPlanCharacters.defaultGroup,
            defaultPosition: raidPlanCharacters.defaultPosition,
          })
          .from(raidPlanCharacters)
          .where(eq(raidPlanCharacters.raidPlanId, id));

        if (planChars.length > 0) {
          await db.insert(raidPlanEncounterAssignments).values(
            planChars.map((c) => ({
              encounterId,
              planCharacterId: c.id,
              groupNumber: c.defaultGroup,
              position: c.defaultPosition,
            })),
          );
        }
      }
    }

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
