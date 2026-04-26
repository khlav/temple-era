import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";
import { db } from "~/server/db";
import { raidPlanTemplateEncounters } from "~/server/db/schema";
import {
  UUID_RE,
  getZoneConfig,
  getTemplateByZoneId,
  validateEncounterOwnership,
} from "../../../_helpers";

const UpdateEncounterSchema = z.object({
  encounterName: z.string().min(1).max(256).optional(),
  aaTemplate: z.string().max(10000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  groupId: z.string().uuid().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ zoneId: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, encounterId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(encounterId)) {
      return NextResponse.json(
        { error: "Invalid encounter ID" },
        { status: 400 },
      );
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const encounter = await validateEncounterOwnership(
      encounterId,
      template.id,
    );
    if (!encounter) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
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

    const updates: Partial<{
      encounterName: string;
      encounterKey: string;
      aaTemplate: string | null;
      sortOrder: number;
      groupId: string | null;
    }> = {};
    if (input.encounterName !== undefined) {
      updates.encounterName = input.encounterName;
      updates.encounterKey = slugifyEncounterName(input.encounterName);
    }
    if (input.aaTemplate !== undefined) updates.aaTemplate = input.aaTemplate;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
    if (input.groupId !== undefined) updates.groupId = input.groupId;

    await db
      .update(raidPlanTemplateEncounters)
      .set(updates)
      .where(eq(raidPlanTemplateEncounters.id, encounterId));

    return NextResponse.json({ success: true });
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
  { params }: { params: Promise<{ zoneId: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, encounterId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(encounterId)) {
      return NextResponse.json(
        { error: "Invalid encounter ID" },
        { status: 400 },
      );
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const encounter = await validateEncounterOwnership(
      encounterId,
      template.id,
    );
    if (!encounter) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    await db
      .delete(raidPlanTemplateEncounters)
      .where(eq(raidPlanTemplateEncounters.id, encounterId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
