import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { getSlotNames } from "~/lib/aa-template";
import { getGroupCount } from "~/components/raid-planner/constants";
import { db } from "~/server/db";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { getZoneConfig, upsertZoneTemplate } from "../_helpers";

export async function GET(
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
    const zoneConfig = getZoneConfig(zoneId);
    if (!zoneConfig) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    const template = await db
      .select({
        id: raidPlanTemplates.id,
        isActive: raidPlanTemplates.isActive,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      })
      .from(raidPlanTemplates)
      .where(eq(raidPlanTemplates.zoneId, zoneId))
      .limit(1);

    if (template.length === 0) {
      return NextResponse.json({
        zoneId,
        zoneName: zoneConfig.name,
        defaultGroupCount: getGroupCount(zoneId),
        template: null,
      });
    }

    const t = template[0]!;
    const [encounters, groups] = await Promise.all([
      db
        .select({
          id: raidPlanTemplateEncounters.id,
          encounterKey: raidPlanTemplateEncounters.encounterKey,
          encounterName: raidPlanTemplateEncounters.encounterName,
          sortOrder: raidPlanTemplateEncounters.sortOrder,
          groupId: raidPlanTemplateEncounters.groupId,
          aaTemplate: raidPlanTemplateEncounters.aaTemplate,
        })
        .from(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.templateId, t.id))
        .orderBy(raidPlanTemplateEncounters.sortOrder),
      db
        .select({
          id: raidPlanTemplateEncounterGroups.id,
          groupName: raidPlanTemplateEncounterGroups.groupName,
          sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
        })
        .from(raidPlanTemplateEncounterGroups)
        .where(eq(raidPlanTemplateEncounterGroups.templateId, t.id))
        .orderBy(raidPlanTemplateEncounterGroups.sortOrder),
    ]);

    return NextResponse.json({
      zoneId,
      zoneName: zoneConfig.name,
      defaultGroupCount: getGroupCount(zoneId),
      template: {
        id: t.id,
        isActive: t.isActive,
        defaultAATemplate: t.defaultAATemplate,
        availableSlots: getSlotNames(t.defaultAATemplate ?? ""),
        encounters,
        encounterGroups: groups,
      },
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const PatchZoneTemplateSchema = z.object({
  isActive: z.boolean().optional(),
  defaultAATemplate: z.string().max(10000).nullable().optional(),
});

export async function PATCH(
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
    const zoneConfig = getZoneConfig(zoneId);
    if (!zoneConfig) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchZoneTemplateSchema.safeParse(body);
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

    const { id: templateId } = await upsertZoneTemplate(zoneId, user.id);

    const updates: Partial<{
      isActive: boolean;
      defaultAATemplate: string | null;
    }> = {};
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.defaultAATemplate !== undefined)
      updates.defaultAATemplate = input.defaultAATemplate;

    const result = await db
      .update(raidPlanTemplates)
      .set(updates)
      .where(eq(raidPlanTemplates.id, templateId))
      .returning({
        id: raidPlanTemplates.id,
        isActive: raidPlanTemplates.isActive,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      });

    const updated = result[0]!;
    return NextResponse.json({
      id: updated.id,
      isActive: updated.isActive,
      defaultAATemplate: updated.defaultAATemplate,
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
