import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { CUSTOM_ZONE_ID } from "~/lib/raid-zones";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanEncounterGroups,
  raidPlanEncounters,
  raidPlanTemplates,
  raidPlanTemplateEncounterGroups,
  raidPlanTemplateEncounters,
} from "~/server/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const CreatePlanSchema = z.object({
  raidHelperEventId: z.string().min(1),
  name: z.string().min(1).max(256),
  zoneId: z.string().min(1).max(64),
  startAt: z.string().datetime().optional().nullable(),
  cloneFromPlanId: z.string().uuid().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "20");
    const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

    const plans = await db
      .select({
        id: raidPlans.id,
        name: raidPlans.name,
        zoneId: raidPlans.zoneId,
        raidHelperEventId: raidPlans.raidHelperEventId,
        startAt: raidPlans.startAt,
        isPublic: raidPlans.isPublic,
        lastModifiedAt: sql<Date>`COALESCE(${raidPlans.updatedAt}, ${raidPlans.createdAt})`,
      })
      .from(raidPlans)
      .orderBy(
        desc(sql`COALESCE(${raidPlans.updatedAt}, ${raidPlans.createdAt})`),
      )
      .limit(limit);

    return NextResponse.json(
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        zoneId: p.zoneId,
        raidHelperEventId: p.raidHelperEventId,
        startAt: p.startAt?.toISOString() ?? null,
        isPublic: p.isPublic,
        lastModifiedAt: new Date(p.lastModifiedAt).toISOString(),
      })),
    );
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;

    // 409 if plan already exists for this event
    const existing = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.raidHelperEventId, input.raidHelperEventId))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A raid plan already exists for this event" },
        { status: 409 },
      );
    }

    const startAt = input.startAt ? new Date(input.startAt) : undefined;

    const result = await db.transaction(async (tx) => {
      const newPlan = await tx
        .insert(raidPlans)
        .values({
          raidHelperEventId: input.raidHelperEventId,
          name: input.name,
          zoneId: input.zoneId,
          startAt,
          createdById: user.id,
          updatedById: user.id,
        })
        .returning({
          id: raidPlans.id,
          name: raidPlans.name,
          zoneId: raidPlans.zoneId,
          raidHelperEventId: raidPlans.raidHelperEventId,
          startAt: raidPlans.startAt,
        });

      const planId = newPlan[0]!.id;

      if (input.cloneFromPlanId) {
        const sourcePlan = await tx
          .select({
            defaultAATemplate: raidPlans.defaultAATemplate,
            useDefaultAA: raidPlans.useDefaultAA,
          })
          .from(raidPlans)
          .where(eq(raidPlans.id, input.cloneFromPlanId))
          .limit(1);

        if (sourcePlan.length > 0) {
          await tx
            .update(raidPlans)
            .set({
              defaultAATemplate: sourcePlan[0]!.defaultAATemplate,
              useDefaultAA: sourcePlan[0]!.useDefaultAA,
            })
            .where(eq(raidPlans.id, planId));

          const sourceGroups = await tx
            .select({
              id: raidPlanEncounterGroups.id,
              groupName: raidPlanEncounterGroups.groupName,
              sortOrder: raidPlanEncounterGroups.sortOrder,
            })
            .from(raidPlanEncounterGroups)
            .where(
              eq(raidPlanEncounterGroups.raidPlanId, input.cloneFromPlanId),
            )
            .orderBy(raidPlanEncounterGroups.sortOrder);

          const cloneGroupIdMap = new Map<string, string>();

          if (sourceGroups.length > 0) {
            const newGroups = sourceGroups.map((g) => ({
              newId: crypto.randomUUID(),
              groupName: g.groupName,
              sortOrder: g.sortOrder,
              oldId: g.id,
            }));
            await tx.insert(raidPlanEncounterGroups).values(
              newGroups.map((g) => ({
                id: g.newId,
                raidPlanId: planId,
                groupName: g.groupName,
                sortOrder: g.sortOrder,
              })),
            );
            for (const g of newGroups) {
              cloneGroupIdMap.set(g.oldId, g.newId);
            }
          }

          const sourceEncounters = await tx
            .select({
              encounterKey: raidPlanEncounters.encounterKey,
              encounterName: raidPlanEncounters.encounterName,
              sortOrder: raidPlanEncounters.sortOrder,
              groupId: raidPlanEncounters.groupId,
              aaTemplate: raidPlanEncounters.aaTemplate,
              useCustomAA: raidPlanEncounters.useCustomAA,
            })
            .from(raidPlanEncounters)
            .where(eq(raidPlanEncounters.raidPlanId, input.cloneFromPlanId))
            .orderBy(raidPlanEncounters.sortOrder);

          if (sourceEncounters.length > 0) {
            await tx.insert(raidPlanEncounters).values(
              sourceEncounters.map((enc) => ({
                raidPlanId: planId,
                encounterKey: enc.encounterKey,
                encounterName: enc.encounterName,
                sortOrder: enc.sortOrder,
                useDefaultGroups: true,
                groupId: enc.groupId
                  ? (cloneGroupIdMap.get(enc.groupId) ?? null)
                  : null,
                aaTemplate: enc.aaTemplate,
                useCustomAA: enc.useCustomAA,
              })),
            );
          }
        }
      } else if (input.zoneId !== CUSTOM_ZONE_ID) {
        const template = await tx
          .select({
            id: raidPlanTemplates.id,
            defaultAATemplate: raidPlanTemplates.defaultAATemplate,
          })
          .from(raidPlanTemplates)
          .where(
            and(
              eq(raidPlanTemplates.zoneId, input.zoneId),
              eq(raidPlanTemplates.isActive, true),
            ),
          )
          .limit(1);

        if (template.length > 0) {
          if (template[0]!.defaultAATemplate) {
            await tx
              .update(raidPlans)
              .set({
                defaultAATemplate: template[0]!.defaultAATemplate,
                useDefaultAA: true,
              })
              .where(eq(raidPlans.id, planId));
          }

          const [templateGroups, templateEncounters] = await Promise.all([
            tx
              .select({
                id: raidPlanTemplateEncounterGroups.id,
                groupName: raidPlanTemplateEncounterGroups.groupName,
                sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
              })
              .from(raidPlanTemplateEncounterGroups)
              .where(
                eq(raidPlanTemplateEncounterGroups.templateId, template[0]!.id),
              )
              .orderBy(raidPlanTemplateEncounterGroups.sortOrder),
            tx
              .select({
                encounterKey: raidPlanTemplateEncounters.encounterKey,
                encounterName: raidPlanTemplateEncounters.encounterName,
                sortOrder: raidPlanTemplateEncounters.sortOrder,
                groupId: raidPlanTemplateEncounters.groupId,
                aaTemplate: raidPlanTemplateEncounters.aaTemplate,
              })
              .from(raidPlanTemplateEncounters)
              .where(eq(raidPlanTemplateEncounters.templateId, template[0]!.id))
              .orderBy(raidPlanTemplateEncounters.sortOrder),
          ]);

          const templateGroupIdMap = new Map<string, string>();

          if (templateGroups.length > 0) {
            const newGroups = templateGroups.map((g) => ({
              newId: crypto.randomUUID(),
              groupName: g.groupName,
              sortOrder: g.sortOrder,
              oldId: g.id,
            }));
            await tx.insert(raidPlanEncounterGroups).values(
              newGroups.map((g) => ({
                id: g.newId,
                raidPlanId: planId,
                groupName: g.groupName,
                sortOrder: g.sortOrder,
              })),
            );
            for (const g of newGroups) {
              templateGroupIdMap.set(g.oldId, g.newId);
            }
          }

          if (templateEncounters.length > 0) {
            await tx.insert(raidPlanEncounters).values(
              templateEncounters.map((enc) => ({
                raidPlanId: planId,
                encounterKey: enc.encounterKey,
                encounterName: enc.encounterName,
                sortOrder: enc.sortOrder,
                useDefaultGroups: true,
                groupId: enc.groupId
                  ? (templateGroupIdMap.get(enc.groupId) ?? null)
                  : null,
                aaTemplate: enc.aaTemplate,
                useCustomAA: !!enc.aaTemplate,
              })),
            );
          }
        }
      }

      return newPlan[0]!;
    });

    return NextResponse.json(
      {
        id: result.id,
        name: result.name,
        zoneId: result.zoneId,
        raidHelperEventId: result.raidHelperEventId,
        startAt: result.startAt?.toISOString() ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
