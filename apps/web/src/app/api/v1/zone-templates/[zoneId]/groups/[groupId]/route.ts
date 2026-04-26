import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import {
  UUID_RE,
  getZoneConfig,
  getTemplateByZoneId,
  validateGroupOwnership,
} from "../../../_helpers";

const UpdateGroupSchema = z.object({
  groupName: z.string().min(1).max(256),
});

const DeleteModeSchema = z.enum(["promote", "deleteChildren"]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ zoneId: string; groupId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, groupId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(groupId)) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const group = await validateGroupOwnership(groupId, template.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpdateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await db
      .update(raidPlanTemplateEncounterGroups)
      .set({ groupName: parsed.data.groupName })
      .where(eq(raidPlanTemplateEncounterGroups.id, groupId));

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
  { params }: { params: Promise<{ zoneId: string; groupId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, groupId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(groupId)) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const group = await validateGroupOwnership(groupId, template.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const modeParam = searchParams.get("mode") ?? "promote";
    const modeResult = DeleteModeSchema.safeParse(modeParam);
    if (!modeResult.success) {
      return NextResponse.json(
        { error: "Invalid mode. Use 'promote' or 'deleteChildren'" },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      if (modeResult.data === "promote") {
        await tx
          .update(raidPlanTemplateEncounters)
          .set({ groupId: null })
          .where(eq(raidPlanTemplateEncounters.groupId, groupId));
      } else {
        await tx
          .delete(raidPlanTemplateEncounters)
          .where(eq(raidPlanTemplateEncounters.groupId, groupId));
      }
      await tx
        .delete(raidPlanTemplateEncounterGroups)
        .where(eq(raidPlanTemplateEncounterGroups.id, groupId));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
