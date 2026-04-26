import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { getZoneConfig, getTemplateByZoneId } from "../../../_helpers";

const ReorderSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
    }),
  ),
  encounters: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
      groupId: z.string().uuid().nullable(),
    }),
  ),
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

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json(
        { error: "Zone template not configured" },
        { status: 404 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { groups, encounters } = parsed.data;

    await db.transaction(async (tx) => {
      for (const g of groups) {
        await tx
          .update(raidPlanTemplateEncounterGroups)
          .set({ sortOrder: g.sortOrder })
          .where(
            and(
              eq(raidPlanTemplateEncounterGroups.id, g.id),
              eq(raidPlanTemplateEncounterGroups.templateId, template.id),
            ),
          );
      }
      for (const e of encounters) {
        await tx
          .update(raidPlanTemplateEncounters)
          .set({ sortOrder: e.sortOrder, groupId: e.groupId })
          .where(
            and(
              eq(raidPlanTemplateEncounters.id, e.id),
              eq(raidPlanTemplateEncounters.templateId, template.id),
            ),
          );
      }
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
