import { z } from "zod";
import { eq, max, inArray } from "drizzle-orm";
import { createTRPCRouter, raidManagerProcedure } from "~/server/api/trpc";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
} from "~/server/db/schema";

export const raidPlanTemplateRouter = createTRPCRouter({
  /**
   * Get the default AA template for a specific zone.
   * Used by the raid planner to reset templates to defaults.
   */
  getByZoneId: raidManagerProcedure
    .input(z.object({ zoneId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.db
        .select({
          id: raidPlanTemplates.id,
          zoneId: raidPlanTemplates.zoneId,
          zoneName: raidPlanTemplates.zoneName,
          defaultAATemplate: raidPlanTemplates.defaultAATemplate,
        })
        .from(raidPlanTemplates)
        .where(eq(raidPlanTemplates.zoneId, input.zoneId))
        .limit(1);

      if (template.length === 0) {
        return null;
      }

      // Get encounters for this template
      const encounters = await ctx.db
        .select({
          id: raidPlanTemplateEncounters.id,
          encounterKey: raidPlanTemplateEncounters.encounterKey,
          encounterName: raidPlanTemplateEncounters.encounterName,
          sortOrder: raidPlanTemplateEncounters.sortOrder,
          aaTemplate: raidPlanTemplateEncounters.aaTemplate,
        })
        .from(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.templateId, template[0]!.id))
        .orderBy(raidPlanTemplateEncounters.sortOrder);

      return {
        ...template[0]!,
        encounters,
      };
    }),

  /**
   * Fetch all templates with their encounters, ordered by sortOrder.
   */
  getAll: raidManagerProcedure.query(async ({ ctx }) => {
    const templates = await ctx.db
      .select({
        id: raidPlanTemplates.id,
        zoneId: raidPlanTemplates.zoneId,
        zoneName: raidPlanTemplates.zoneName,
        defaultGroupCount: raidPlanTemplates.defaultGroupCount,
        isActive: raidPlanTemplates.isActive,
        sortOrder: raidPlanTemplates.sortOrder,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      })
      .from(raidPlanTemplates)
      .orderBy(raidPlanTemplates.sortOrder);

    if (templates.length === 0) {
      return [];
    }

    const templateIds = templates.map((t) => t.id);

    const encounters = await ctx.db
      .select({
        id: raidPlanTemplateEncounters.id,
        templateId: raidPlanTemplateEncounters.templateId,
        encounterKey: raidPlanTemplateEncounters.encounterKey,
        encounterName: raidPlanTemplateEncounters.encounterName,
        sortOrder: raidPlanTemplateEncounters.sortOrder,
        aaTemplate: raidPlanTemplateEncounters.aaTemplate,
      })
      .from(raidPlanTemplateEncounters)
      .where(inArray(raidPlanTemplateEncounters.templateId, templateIds))
      .orderBy(raidPlanTemplateEncounters.sortOrder);

    // Group encounters by templateId
    const encountersByTemplate = new Map<string, typeof encounters>();
    for (const enc of encounters) {
      const list = encountersByTemplate.get(enc.templateId) ?? [];
      list.push(enc);
      encountersByTemplate.set(enc.templateId, list);
    }

    return templates.map((t) => ({
      ...t,
      encounters: encountersByTemplate.get(t.id) ?? [],
    }));
  }),

  /**
   * Create or update a zone template.
   * Uses onConflictDoUpdate on the zoneId unique index.
   */
  upsertTemplate: raidManagerProcedure
    .input(
      z.object({
        zoneId: z.string().min(1).max(64),
        zoneName: z.string().min(1).max(256),
        defaultGroupCount: z.number().int().min(1).max(8),
        isActive: z.boolean().default(true),
        sortOrder: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .insert(raidPlanTemplates)
        .values({
          zoneId: input.zoneId,
          zoneName: input.zoneName,
          defaultGroupCount: input.defaultGroupCount,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          createdById: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: raidPlanTemplates.zoneId,
          set: {
            zoneName: input.zoneName,
            defaultGroupCount: input.defaultGroupCount,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
          },
        })
        .returning({ id: raidPlanTemplates.id });

      return { id: result[0]!.id };
    }),

  /**
   * Partial update of a template by ID.
   */
  updateTemplate: raidManagerProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        defaultGroupCount: z.number().int().min(1).max(8).optional(),
        defaultAATemplate: z.string().max(10000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        isActive: boolean;
        sortOrder: number;
        defaultGroupCount: number;
        defaultAATemplate: string | null;
      }> = {};

      if (input.isActive !== undefined) updates.isActive = input.isActive;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.defaultGroupCount !== undefined)
        updates.defaultGroupCount = input.defaultGroupCount;
      if (input.defaultAATemplate !== undefined)
        updates.defaultAATemplate = input.defaultAATemplate;

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      await ctx.db
        .update(raidPlanTemplates)
        .set(updates)
        .where(eq(raidPlanTemplates.id, input.templateId));

      return { success: true };
    }),

  /**
   * Delete a template by ID. FK cascade handles encounters.
   */
  deleteTemplate: raidManagerProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(raidPlanTemplates)
        .where(eq(raidPlanTemplates.id, input.templateId));

      return { success: true };
    }),

  /**
   * Add an encounter to a template.
   * Auto-generates encounterKey (slugified) and computes next sortOrder.
   */
  addEncounter: raidManagerProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
        encounterName: z.string().min(1).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get max sort order for this template
      const maxSortResult = await ctx.db
        .select({ maxSort: max(raidPlanTemplateEncounters.sortOrder) })
        .from(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.templateId, input.templateId));

      const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

      const encounterKey = slugifyEncounterName(input.encounterName);

      const newEncounter = await ctx.db
        .insert(raidPlanTemplateEncounters)
        .values({
          templateId: input.templateId,
          encounterKey,
          encounterName: input.encounterName,
          sortOrder: nextSortOrder,
        })
        .returning({
          id: raidPlanTemplateEncounters.id,
          encounterKey: raidPlanTemplateEncounters.encounterKey,
          encounterName: raidPlanTemplateEncounters.encounterName,
          sortOrder: raidPlanTemplateEncounters.sortOrder,
        });

      return newEncounter[0]!;
    }),

  /**
   * Update an encounter by ID. Optionally rename (regenerates key) or change sortOrder.
   */
  updateEncounter: raidManagerProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
        encounterName: z.string().min(1).max(256).optional(),
        sortOrder: z.number().int().optional(),
        aaTemplate: z.string().max(10000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        encounterName: string;
        encounterKey: string;
        sortOrder: number;
        aaTemplate: string | null;
      }> = {};

      if (input.encounterName !== undefined) {
        updates.encounterName = input.encounterName;
        updates.encounterKey = slugifyEncounterName(input.encounterName);
      }

      if (input.sortOrder !== undefined) {
        updates.sortOrder = input.sortOrder;
      }

      if (input.aaTemplate !== undefined) {
        updates.aaTemplate = input.aaTemplate;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      await ctx.db
        .update(raidPlanTemplateEncounters)
        .set(updates)
        .where(eq(raidPlanTemplateEncounters.id, input.encounterId));

      return { success: true };
    }),

  /**
   * Delete an encounter by ID.
   */
  deleteEncounter: raidManagerProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.id, input.encounterId));

      return { success: true };
    }),

  /**
   * Bulk reorder encounters. Wrapped in a transaction.
   */
  reorderEncounters: raidManagerProcedure
    .input(
      z.object({
        encounters: z.array(
          z.object({
            id: z.string().uuid(),
            sortOrder: z.number().int(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const enc of input.encounters) {
          await tx
            .update(raidPlanTemplateEncounters)
            .set({ sortOrder: enc.sortOrder })
            .where(eq(raidPlanTemplateEncounters.id, enc.id));
        }
      });

      return { success: true };
    }),
});
