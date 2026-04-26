// src/app/api/v1/zone-templates/route.ts
import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { getGroupCount } from "~/components/raid-planner/constants";
import { getSlotNames } from "~/lib/aa-template";
import { db } from "~/server/db";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await db
      .select({
        id: raidPlanTemplates.id,
        zoneId: raidPlanTemplates.zoneId,
        isActive: raidPlanTemplates.isActive,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      })
      .from(raidPlanTemplates);

    if (templates.length === 0) {
      return NextResponse.json(
        RAID_ZONE_CONFIG.map((zone) => ({
          zoneId: zone.instance,
          zoneName: zone.name,
          defaultGroupCount: getGroupCount(zone.instance),
          template: null,
        })),
      );
    }

    const templateIds = templates.map((t) => t.id);

    const [encounters, groups] = await Promise.all([
      db
        .select({
          id: raidPlanTemplateEncounters.id,
          templateId: raidPlanTemplateEncounters.templateId,
          encounterKey: raidPlanTemplateEncounters.encounterKey,
          encounterName: raidPlanTemplateEncounters.encounterName,
          sortOrder: raidPlanTemplateEncounters.sortOrder,
          groupId: raidPlanTemplateEncounters.groupId,
          aaTemplate: raidPlanTemplateEncounters.aaTemplate,
        })
        .from(raidPlanTemplateEncounters)
        .where(inArray(raidPlanTemplateEncounters.templateId, templateIds))
        .orderBy(asc(raidPlanTemplateEncounters.sortOrder)),
      db
        .select({
          id: raidPlanTemplateEncounterGroups.id,
          templateId: raidPlanTemplateEncounterGroups.templateId,
          groupName: raidPlanTemplateEncounterGroups.groupName,
          sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
        })
        .from(raidPlanTemplateEncounterGroups)
        .where(inArray(raidPlanTemplateEncounterGroups.templateId, templateIds))
        .orderBy(asc(raidPlanTemplateEncounterGroups.sortOrder)),
    ]);

    const encountersByTemplate = new Map<string, typeof encounters>();
    for (const enc of encounters) {
      const list = encountersByTemplate.get(enc.templateId) ?? [];
      list.push(enc);
      encountersByTemplate.set(enc.templateId, list);
    }

    const groupsByTemplate = new Map<string, typeof groups>();
    for (const g of groups) {
      const list = groupsByTemplate.get(g.templateId) ?? [];
      list.push(g);
      groupsByTemplate.set(g.templateId, list);
    }

    const templateByZoneId = new Map(
      templates.map((t) => [
        t.zoneId,
        {
          id: t.id,
          isActive: t.isActive,
          defaultAATemplate: t.defaultAATemplate,
          availableSlots: getSlotNames(t.defaultAATemplate ?? ""),
          encounters: encountersByTemplate.get(t.id) ?? [],
          encounterGroups: groupsByTemplate.get(t.id) ?? [],
        },
      ]),
    );

    return NextResponse.json(
      RAID_ZONE_CONFIG.map((zone) => ({
        zoneId: zone.instance,
        zoneName: zone.name,
        defaultGroupCount: getGroupCount(zone.instance),
        template: templateByZoneId.get(zone.instance) ?? null,
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
