import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { getZoneConfig, upsertZoneTemplate } from "../../_helpers";

const CreateGroupSchema = z.object({
  groupName: z.string().min(1).max(256),
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

    const parsed = CreateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { id: templateId } = await upsertZoneTemplate(zoneId, user.id);

    const [encounterMaxResult, groupMaxResult] = await Promise.all([
      db
        .select({ maxSort: max(raidPlanTemplateEncounters.sortOrder) })
        .from(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.templateId, templateId)),
      db
        .select({ maxSort: max(raidPlanTemplateEncounterGroups.sortOrder) })
        .from(raidPlanTemplateEncounterGroups)
        .where(eq(raidPlanTemplateEncounterGroups.templateId, templateId)),
    ]);

    const maxEncounter = encounterMaxResult[0]?.maxSort ?? -1;
    const maxGroup = groupMaxResult[0]?.maxSort ?? -1;
    const nextSortOrder = Math.max(maxEncounter, maxGroup) + 1;

    const newGroup = await db
      .insert(raidPlanTemplateEncounterGroups)
      .values({
        templateId,
        groupName: parsed.data.groupName,
        sortOrder: nextSortOrder,
      })
      .returning({
        id: raidPlanTemplateEncounterGroups.id,
        groupName: raidPlanTemplateEncounterGroups.groupName,
        sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
      });

    return NextResponse.json(newGroup[0]!, { status: 201 });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
