import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { getSlotNames } from "~/lib/aa-template";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounterGroups,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,
  characters,
} from "~/server/db/schema";
import { eq, inArray, or, sql } from "drizzle-orm";

const PatchPlanSchema = z.object({
  defaultAATemplate: z.string().nullable().optional(),
  useDefaultAA: z.boolean().optional(),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
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

    const plan = await db
      .select({
        id: raidPlans.id,
        name: raidPlans.name,
        zoneId: raidPlans.zoneId,
        raidHelperEventId: raidPlans.raidHelperEventId,
        startAt: raidPlans.startAt,
        isPublic: raidPlans.isPublic,
        defaultAATemplate: raidPlans.defaultAATemplate,
        useDefaultAA: raidPlans.useDefaultAA,
        lastModifiedAt: sql<Date>`COALESCE(${raidPlans.updatedAt}, ${raidPlans.createdAt})`,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const [planCharacters, encounters, encounterGroups] = await Promise.all([
      db
        .select({
          id: raidPlanCharacters.id,
          characterId: raidPlanCharacters.characterId,
          characterName: raidPlanCharacters.characterName,
          defaultGroup: raidPlanCharacters.defaultGroup,
          defaultPosition: raidPlanCharacters.defaultPosition,
          class: sql<
            string | null
          >`COALESCE(${characters.class}, ${raidPlanCharacters.writeInClass})`,
        })
        .from(raidPlanCharacters)
        .leftJoin(
          characters,
          eq(raidPlanCharacters.characterId, characters.characterId),
        )
        .where(eq(raidPlanCharacters.raidPlanId, id))
        .orderBy(
          raidPlanCharacters.defaultGroup,
          raidPlanCharacters.defaultPosition,
          raidPlanCharacters.characterName,
          raidPlanCharacters.id,
        ),
      db
        .select({
          id: raidPlanEncounters.id,
          encounterKey: raidPlanEncounters.encounterKey,
          encounterName: raidPlanEncounters.encounterName,
          sortOrder: raidPlanEncounters.sortOrder,
          groupId: raidPlanEncounters.groupId,
          useDefaultGroups: raidPlanEncounters.useDefaultGroups,
          aaTemplate: raidPlanEncounters.aaTemplate,
          useCustomAA: raidPlanEncounters.useCustomAA,
        })
        .from(raidPlanEncounters)
        .where(eq(raidPlanEncounters.raidPlanId, id))
        .orderBy(raidPlanEncounters.sortOrder),
      db
        .select({
          id: raidPlanEncounterGroups.id,
          groupName: raidPlanEncounterGroups.groupName,
          sortOrder: raidPlanEncounterGroups.sortOrder,
        })
        .from(raidPlanEncounterGroups)
        .where(eq(raidPlanEncounterGroups.raidPlanId, id))
        .orderBy(raidPlanEncounterGroups.sortOrder),
    ]);

    const customEncounterIds = encounters
      .filter((e) => !e.useDefaultGroups)
      .map((e) => e.id);

    let encounterAssignments: {
      encounterId: string;
      planCharacterId: string;
      groupNumber: number | null;
      position: number | null;
    }[] = [];

    if (customEncounterIds.length > 0) {
      encounterAssignments = await db
        .select({
          encounterId: raidPlanEncounterAssignments.encounterId,
          planCharacterId: raidPlanEncounterAssignments.planCharacterId,
          groupNumber: raidPlanEncounterAssignments.groupNumber,
          position: raidPlanEncounterAssignments.position,
        })
        .from(raidPlanEncounterAssignments)
        .where(
          inArray(raidPlanEncounterAssignments.encounterId, customEncounterIds),
        )
        .orderBy(
          raidPlanEncounterAssignments.encounterId,
          raidPlanEncounterAssignments.groupNumber,
          raidPlanEncounterAssignments.position,
        );
    }

    const encounterIds = encounters.map((e) => e.id);

    const aaSlotAssignments = await db
      .select({
        id: raidPlanEncounterAASlots.id,
        encounterId: raidPlanEncounterAASlots.encounterId,
        raidPlanId: raidPlanEncounterAASlots.raidPlanId,
        planCharacterId: raidPlanEncounterAASlots.planCharacterId,
        slotName: raidPlanEncounterAASlots.slotName,
      })
      .from(raidPlanEncounterAASlots)
      .where(
        or(
          eq(raidPlanEncounterAASlots.raidPlanId, id),
          encounterIds.length > 0
            ? inArray(raidPlanEncounterAASlots.encounterId, encounterIds)
            : undefined,
        ),
      )
      .orderBy(raidPlanEncounterAASlots.sortOrder);

    const p = plan[0]!;
    return NextResponse.json({
      id: p.id,
      name: p.name,
      zoneId: p.zoneId,
      raidHelperEventId: p.raidHelperEventId,
      startAt: p.startAt?.toISOString() ?? null,
      isPublic: p.isPublic,
      defaultAATemplate: p.defaultAATemplate,
      useDefaultAA: p.useDefaultAA,
      lastModifiedAt: new Date(p.lastModifiedAt).toISOString(),
      availableSlots: getSlotNames(p.defaultAATemplate ?? ""),
      characters: planCharacters,
      encounterGroups,
      encounters: encounters.map((e) => ({
        ...e,
        availableSlots: getSlotNames(e.aaTemplate ?? ""),
      })),
      encounterAssignments,
      aaSlotAssignments,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const parsed = PatchPlanSchema.safeParse(body);
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

    const updates: Partial<{
      defaultAATemplate: string | null;
      useDefaultAA: boolean;
    }> = {};
    if (input.defaultAATemplate !== undefined)
      updates.defaultAATemplate = input.defaultAATemplate;
    if (input.useDefaultAA !== undefined)
      updates.useDefaultAA = input.useDefaultAA;

    const result = await db
      .update(raidPlans)
      .set({ ...updates, updatedById: user.id })
      .where(eq(raidPlans.id, id))
      .returning({
        id: raidPlans.id,
        defaultAATemplate: raidPlans.defaultAATemplate,
        useDefaultAA: raidPlans.useDefaultAA,
      });

    if (result.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const updated = result[0]!;
    return NextResponse.json({
      id: updated.id,
      defaultAATemplate: updated.defaultAATemplate,
      useDefaultAA: updated.useDefaultAA,
      availableSlots: getSlotNames(updated.defaultAATemplate ?? ""),
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const result = await db
      .delete(raidPlans)
      .where(eq(raidPlans.id, id))
      .returning({ id: raidPlans.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
