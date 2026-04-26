import { and, eq } from "drizzle-orm";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { getGroupCount } from "~/components/raid-planner/constants";
import { db } from "~/server/db";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getZoneConfig(zoneId: string) {
  return RAID_ZONE_CONFIG.find((z) => z.instance === zoneId) ?? null;
}

/**
 * Ensures the zone template record exists. On conflict (zone already has a template),
 * only refreshes zoneName — does not overwrite isActive, sortOrder, or other fields.
 */
export async function upsertZoneTemplate(zoneId: string, createdById: string) {
  const sortOrder = RAID_ZONE_CONFIG.findIndex((z) => z.instance === zoneId);
  const zoneConfig = sortOrder !== -1 ? RAID_ZONE_CONFIG[sortOrder] : null;
  if (!zoneConfig) throw new Error(`Unknown zone: ${zoneId}`);
  const result = await db
    .insert(raidPlanTemplates)
    .values({
      zoneId,
      zoneName: zoneConfig.name,
      defaultGroupCount: getGroupCount(zoneId),
      isActive: true,
      sortOrder,
      createdById,
    })
    .onConflictDoUpdate({
      target: raidPlanTemplates.zoneId,
      set: { zoneName: zoneConfig.name },
    })
    .returning({ id: raidPlanTemplates.id });
  return result[0]!;
}

export async function getTemplateByZoneId(zoneId: string) {
  const result = await db
    .select({ id: raidPlanTemplates.id })
    .from(raidPlanTemplates)
    .where(eq(raidPlanTemplates.zoneId, zoneId))
    .limit(1);
  return result[0] ?? null;
}

export async function validateEncounterOwnership(
  encounterId: string,
  templateId: string,
) {
  const result = await db
    .select({ id: raidPlanTemplateEncounters.id })
    .from(raidPlanTemplateEncounters)
    .where(
      and(
        eq(raidPlanTemplateEncounters.id, encounterId),
        eq(raidPlanTemplateEncounters.templateId, templateId),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}

export async function validateGroupOwnership(
  groupId: string,
  templateId: string,
) {
  const result = await db
    .select({ id: raidPlanTemplateEncounterGroups.id })
    .from(raidPlanTemplateEncounterGroups)
    .where(
      and(
        eq(raidPlanTemplateEncounterGroups.id, groupId),
        eq(raidPlanTemplateEncounterGroups.templateId, templateId),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}
