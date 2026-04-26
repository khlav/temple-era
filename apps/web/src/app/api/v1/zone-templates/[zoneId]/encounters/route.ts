import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";
import { db } from "~/server/db";
import { raidPlanTemplateEncounters } from "~/server/db/schema";
import {
  getZoneConfig,
  upsertZoneTemplate,
  validateGroupOwnership,
} from "../../_helpers";

const AddEncounterSchema = z.object({
  encounterName: z.string().min(1).max(256),
  groupId: z.string().uuid().nullable().optional(),
  aaTemplate: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = AddEncounterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { id: templateId } = await upsertZoneTemplate(zoneId, user.id);

    if (parsed.data.groupId) {
      const group = await validateGroupOwnership(
        parsed.data.groupId,
        templateId,
      );
      if (!group) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
    }

    const maxSortResult = await db
      .select({ maxSort: max(raidPlanTemplateEncounters.sortOrder) })
      .from(raidPlanTemplateEncounters)
      .where(eq(raidPlanTemplateEncounters.templateId, templateId));

    const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

    const newEncounter = await db
      .insert(raidPlanTemplateEncounters)
      .values({
        templateId,
        encounterKey: slugifyEncounterName(parsed.data.encounterName),
        encounterName: parsed.data.encounterName,
        sortOrder: nextSortOrder,
        groupId: parsed.data.groupId ?? null,
        aaTemplate: parsed.data.aaTemplate ?? null,
      })
      .returning({
        id: raidPlanTemplateEncounters.id,
        encounterKey: raidPlanTemplateEncounters.encounterKey,
        encounterName: raidPlanTemplateEncounters.encounterName,
        sortOrder: raidPlanTemplateEncounters.sortOrder,
        groupId: raidPlanTemplateEncounters.groupId,
        aaTemplate: raidPlanTemplateEncounters.aaTemplate,
      });

    return NextResponse.json(newEncounter[0]!, { status: 201 });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
