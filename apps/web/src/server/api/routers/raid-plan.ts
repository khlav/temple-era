import { z } from "zod";
import {
  eq,
  inArray,
  notInArray,
  max,
  ilike,
  and,
  or,
  desc,
  sql,
} from "drizzle-orm";
import {
  createTRPCRouter,
  publicProcedure,
  raidManagerProcedure,
} from "~/server/api/trpc";
import { CUSTOM_ZONE_ID } from "~/lib/raid-zones";
import {
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  characters,
  raids,
} from "~/server/db/schema";
import { TRPCError } from "@trpc/server";
import { getSlotNames } from "~/lib/aa-template";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";

export const raidPlanRouter = createTRPCRouter({
  /**
   * Check which Raid-Helper events have existing raid plans.
   * Returns a map of raidHelperEventId -> raidPlanId for events that have plans.
   */
  getExistingPlansForEvents: raidManagerProcedure
    .input(
      z.object({
        raidHelperEventIds: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.raidHelperEventIds.length === 0) {
        return {};
      }

      const plans = await ctx.db
        .select({
          id: raidPlans.id,
          raidHelperEventId: raidPlans.raidHelperEventId,
        })
        .from(raidPlans)
        .where(inArray(raidPlans.raidHelperEventId, input.raidHelperEventIds));

      // Return as a map: raidHelperEventId -> planId
      const result: Record<string, string> = {};
      for (const plan of plans) {
        result[plan.raidHelperEventId] = plan.id;
      }
      return result;
    }),

  /**
   * Get past plans - plans not linked to any of the current scheduled events.
   * Returns basic plan info for display in a list.
   */
  getPastPlans: raidManagerProcedure
    .input(
      z.object({
        currentEventIds: z.array(z.string()),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Build the where clause based on whether we have current events
      const whereClause =
        input.currentEventIds.length > 0
          ? notInArray(raidPlans.raidHelperEventId, input.currentEventIds)
          : undefined;

      const plans = await ctx.db
        .select({
          id: raidPlans.id,
          name: raidPlans.name,
          zoneId: raidPlans.zoneId,
          raidHelperEventId: raidPlans.raidHelperEventId,
          createdAt: raidPlans.createdAt,
          startAt: raidPlans.startAt,
        })
        .from(raidPlans)
        .where(whereClause)
        .orderBy(desc(raidPlans.startAt), desc(raidPlans.createdAt))
        .limit(input.limit);

      return plans;
    }),

  /**
   * Fetch a raid plan by ID with all characters and encounters
   */
  getById: raidManagerProcedure
    .input(z.object({ planId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch the plan
      const plan = await ctx.db
        .select({
          id: raidPlans.id,
          name: raidPlans.name,
          zoneId: raidPlans.zoneId,
          raidHelperEventId: raidPlans.raidHelperEventId,
          eventId: raidPlans.eventId,
          createdAt: raidPlans.createdAt,
          startAt: raidPlans.startAt,
          defaultAATemplate: raidPlans.defaultAATemplate,
          useDefaultAA: raidPlans.useDefaultAA,
          isPublic: raidPlans.isPublic,
        })
        .from(raidPlans)
        .where(eq(raidPlans.id, input.planId))
        .limit(1);

      if (plan.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      // Fetch characters and encounters in parallel (independent queries)
      const [planCharacters, encounters] = await Promise.all([
        ctx.db
          .select({
            id: raidPlanCharacters.id,
            characterId: raidPlanCharacters.characterId,
            characterName: raidPlanCharacters.characterName,
            defaultGroup: raidPlanCharacters.defaultGroup,
            defaultPosition: raidPlanCharacters.defaultPosition,
            // COALESCE: use joined character class, fall back to write-in class
            class: sql<
              string | null
            >`COALESCE(${characters.class}, ${raidPlanCharacters.writeInClass})`,
            server: characters.server,
          })
          .from(raidPlanCharacters)
          .leftJoin(
            characters,
            eq(raidPlanCharacters.characterId, characters.characterId),
          )
          .where(eq(raidPlanCharacters.raidPlanId, input.planId)),
        ctx.db
          .select({
            id: raidPlanEncounters.id,
            encounterKey: raidPlanEncounters.encounterKey,
            encounterName: raidPlanEncounters.encounterName,
            sortOrder: raidPlanEncounters.sortOrder,
            useDefaultGroups: raidPlanEncounters.useDefaultGroups,
            aaTemplate: raidPlanEncounters.aaTemplate,
            useCustomAA: raidPlanEncounters.useCustomAA,
          })
          .from(raidPlanEncounters)
          .where(eq(raidPlanEncounters.raidPlanId, input.planId))
          .orderBy(raidPlanEncounters.sortOrder),
      ]);

      // Fetch linked raid event if exists
      let event: { raidId: number; name: string; date: string } | null = null;
      if (plan[0]!.eventId) {
        const eventResult = await ctx.db
          .select({
            raidId: raids.raidId,
            name: raids.name,
            date: raids.date,
          })
          .from(raids)
          .where(eq(raids.raidId, plan[0]!.eventId))
          .limit(1);
        event = eventResult[0] ?? null;
      }

      // Fetch encounter assignments for encounters with custom groups
      const customEncounterIds = encounters
        .filter((e) => !e.useDefaultGroups)
        .map((e) => e.id);

      let encounterAssignments: {
        encounterId: string;
        planCharacterId: string;
        groupNumber: number | null;
        position: number | null;
      }[] = [];

      if (customEncounterIds.length > 0) {
        encounterAssignments = await ctx.db
          .select({
            encounterId: raidPlanEncounterAssignments.encounterId,
            planCharacterId: raidPlanEncounterAssignments.planCharacterId,
            groupNumber: raidPlanEncounterAssignments.groupNumber,
            position: raidPlanEncounterAssignments.position,
          })
          .from(raidPlanEncounterAssignments)
          .where(
            inArray(
              raidPlanEncounterAssignments.encounterId,
              customEncounterIds,
            ),
          );
      }

      // Fetch all AA slot assignments in a single query (encounter-specific + default/trash)
      const encounterIds = encounters.map((e) => e.id);
      const aaSlotConditions = [
        eq(raidPlanEncounterAASlots.raidPlanId, input.planId),
      ];
      if (encounterIds.length > 0) {
        aaSlotConditions.push(
          inArray(raidPlanEncounterAASlots.encounterId, encounterIds),
        );
      }

      const aaSlotAssignments = await ctx.db
        .select({
          id: raidPlanEncounterAASlots.id,
          encounterId: raidPlanEncounterAASlots.encounterId,
          raidPlanId: raidPlanEncounterAASlots.raidPlanId,
          planCharacterId: raidPlanEncounterAASlots.planCharacterId,
          slotName: raidPlanEncounterAASlots.slotName,
          sortOrder: raidPlanEncounterAASlots.sortOrder,
        })
        .from(raidPlanEncounterAASlots)
        .where(or(...aaSlotConditions));

      return {
        ...plan[0]!,
        event,
        characters: planCharacters,
        encounters,
        encounterAssignments,
        aaSlotAssignments,
      };
    }),

  /**
   * Toggle the public visibility of a raid plan
   */
  togglePublic: raidManagerProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        isPublic: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(raidPlans)
        .set({ isPublic: input.isPublic })
        .where(eq(raidPlans.id, input.planId))
        .returning({ id: raidPlans.id, isPublic: raidPlans.isPublic });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      return { isPublic: result[0]!.isPublic };
    }),

  /**
   * Fetch a public raid plan by ID (requires authentication but not raid manager role)
   */
  getPublicById: publicProcedure
    .input(z.object({ planId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.db
        .select({
          id: raidPlans.id,
          name: raidPlans.name,
          zoneId: raidPlans.zoneId,
          raidHelperEventId: raidPlans.raidHelperEventId,
          eventId: raidPlans.eventId,
          createdAt: raidPlans.createdAt,
          startAt: raidPlans.startAt,
          defaultAATemplate: raidPlans.defaultAATemplate,
          useDefaultAA: raidPlans.useDefaultAA,
          isPublic: raidPlans.isPublic,
        })
        .from(raidPlans)
        .where(
          and(eq(raidPlans.id, input.planId), eq(raidPlans.isPublic, true)),
        )
        .limit(1);

      if (plan.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      const [planCharacters, encounters] = await Promise.all([
        ctx.db
          .select({
            id: raidPlanCharacters.id,
            characterId: raidPlanCharacters.characterId,
            characterName: raidPlanCharacters.characterName,
            defaultGroup: raidPlanCharacters.defaultGroup,
            defaultPosition: raidPlanCharacters.defaultPosition,
            class: sql<
              string | null
            >`COALESCE(${characters.class}, ${raidPlanCharacters.writeInClass})`,
            server: characters.server,
          })
          .from(raidPlanCharacters)
          .leftJoin(
            characters,
            eq(raidPlanCharacters.characterId, characters.characterId),
          )
          .where(eq(raidPlanCharacters.raidPlanId, input.planId)),
        ctx.db
          .select({
            id: raidPlanEncounters.id,
            encounterKey: raidPlanEncounters.encounterKey,
            encounterName: raidPlanEncounters.encounterName,
            sortOrder: raidPlanEncounters.sortOrder,
            useDefaultGroups: raidPlanEncounters.useDefaultGroups,
            aaTemplate: raidPlanEncounters.aaTemplate,
            useCustomAA: raidPlanEncounters.useCustomAA,
          })
          .from(raidPlanEncounters)
          .where(eq(raidPlanEncounters.raidPlanId, input.planId))
          .orderBy(raidPlanEncounters.sortOrder),
      ]);

      let event: { raidId: number; name: string; date: string } | null = null;
      if (plan[0]!.eventId) {
        const eventResult = await ctx.db
          .select({
            raidId: raids.raidId,
            name: raids.name,
            date: raids.date,
          })
          .from(raids)
          .where(eq(raids.raidId, plan[0]!.eventId))
          .limit(1);
        event = eventResult[0] ?? null;
      }

      const customEncounterIds = encounters
        .filter((e) => !e.useDefaultGroups)
        .map((e) => e.id);

      let encounterAssignments: {
        encounterId: string;
        planCharacterId: string;
        groupNumber: number | null;
        position: number | null;
      }[] = [];

      if (customEncounterIds.length > 0) {
        encounterAssignments = await ctx.db
          .select({
            encounterId: raidPlanEncounterAssignments.encounterId,
            planCharacterId: raidPlanEncounterAssignments.planCharacterId,
            groupNumber: raidPlanEncounterAssignments.groupNumber,
            position: raidPlanEncounterAssignments.position,
          })
          .from(raidPlanEncounterAssignments)
          .where(
            inArray(
              raidPlanEncounterAssignments.encounterId,
              customEncounterIds,
            ),
          );
      }

      const encounterIds = encounters.map((e) => e.id);
      const aaSlotConditions = [
        eq(raidPlanEncounterAASlots.raidPlanId, input.planId),
      ];
      if (encounterIds.length > 0) {
        aaSlotConditions.push(
          inArray(raidPlanEncounterAASlots.encounterId, encounterIds),
        );
      }

      const aaSlotAssignments = await ctx.db
        .select({
          id: raidPlanEncounterAASlots.id,
          encounterId: raidPlanEncounterAASlots.encounterId,
          raidPlanId: raidPlanEncounterAASlots.raidPlanId,
          planCharacterId: raidPlanEncounterAASlots.planCharacterId,
          slotName: raidPlanEncounterAASlots.slotName,
          sortOrder: raidPlanEncounterAASlots.sortOrder,
        })
        .from(raidPlanEncounterAASlots)
        .where(or(...aaSlotConditions));

      return {
        ...plan[0]!,
        event,
        characters: planCharacters,
        encounters,
        encounterAssignments,
        aaSlotAssignments,
      };
    }),

  /**
   * Get all public raid plans in reverse chronological order
   */
  getPublicPlans: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const plans = await ctx.db
        .select({
          id: raidPlans.id,
          name: raidPlans.name,
          zoneId: raidPlans.zoneId,
          raidHelperEventId: raidPlans.raidHelperEventId,
          createdAt: raidPlans.createdAt,
          startAt: raidPlans.startAt,
        })
        .from(raidPlans)
        .where(eq(raidPlans.isPublic, true))
        .orderBy(desc(raidPlans.startAt), desc(raidPlans.createdAt))
        .limit(input.limit);

      return plans;
    }),

  /**
   * Delete a raid plan (cascades to characters, encounters, assignments)
   */
  delete: raidManagerProcedure
    .input(z.object({ planId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(raidPlans)
        .where(eq(raidPlans.id, input.planId))
        .returning({ id: raidPlans.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      return { success: true };
    }),

  /**
   * Create a new encounter for a raid plan
   */
  createEncounter: raidManagerProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        encounterName: z.string().min(1).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the plan exists
      const plan = await ctx.db
        .select({ id: raidPlans.id })
        .from(raidPlans)
        .where(eq(raidPlans.id, input.planId))
        .limit(1);

      if (plan.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      // Get max sort order for this plan
      const maxSortResult = await ctx.db
        .select({ maxSort: max(raidPlanEncounters.sortOrder) })
        .from(raidPlanEncounters)
        .where(eq(raidPlanEncounters.raidPlanId, input.planId));

      const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

      const encounterKey = slugifyEncounterName(input.encounterName);

      // Insert the encounter
      const newEncounter = await ctx.db
        .insert(raidPlanEncounters)
        .values({
          raidPlanId: input.planId,
          encounterKey,
          encounterName: input.encounterName,
          sortOrder: nextSortOrder,
          useDefaultGroups: true,
        })
        .returning({
          id: raidPlanEncounters.id,
          encounterKey: raidPlanEncounters.encounterKey,
          encounterName: raidPlanEncounters.encounterName,
          sortOrder: raidPlanEncounters.sortOrder,
          useDefaultGroups: raidPlanEncounters.useDefaultGroups,
        });

      return newEncounter[0]!;
    }),

  /**
   * Update an encounter (toggle useDefaultGroups, rename, or update AA template)
   */
  updateEncounter: raidManagerProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
        useDefaultGroups: z.boolean().optional(),
        encounterName: z.string().min(1).max(256).optional(),
        aaTemplate: z.string().max(10000).nullable().optional(),
        useCustomAA: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        useDefaultGroups: boolean;
        encounterName: string;
        encounterKey: string;
        aaTemplate: string | null;
        useCustomAA: boolean;
      }> = {};

      if (input.useDefaultGroups !== undefined) {
        updates.useDefaultGroups = input.useDefaultGroups;
      }

      if (input.encounterName !== undefined) {
        updates.encounterName = input.encounterName;
        updates.encounterKey = slugifyEncounterName(input.encounterName);
      }

      if (input.aaTemplate !== undefined) {
        updates.aaTemplate = input.aaTemplate;
      }

      if (input.useCustomAA !== undefined) {
        updates.useCustomAA = input.useCustomAA;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      const result = await ctx.db
        .update(raidPlanEncounters)
        .set(updates)
        .where(eq(raidPlanEncounters.id, input.encounterId))
        .returning({ id: raidPlanEncounters.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Encounter not found",
        });
      }

      // Clean up orphaned AA slot assignments when encounter template changes
      if (input.aaTemplate !== undefined) {
        const slotNames = input.aaTemplate
          ? getSlotNames(input.aaTemplate)
          : [];

        const conditions = [
          eq(raidPlanEncounterAASlots.encounterId, input.encounterId),
        ];
        if (slotNames.length > 0) {
          conditions.push(
            notInArray(raidPlanEncounterAASlots.slotName, slotNames),
          );
        }

        await ctx.db.delete(raidPlanEncounterAASlots).where(and(...conditions));
      }

      // Seed encounter assignments from defaults when toggling custom groups on
      if (input.useDefaultGroups === false) {
        const existing = await ctx.db
          .select({ id: raidPlanEncounterAssignments.id })
          .from(raidPlanEncounterAssignments)
          .where(
            eq(raidPlanEncounterAssignments.encounterId, input.encounterId),
          )
          .limit(1);

        if (existing.length === 0) {
          const encounter = await ctx.db
            .select({ raidPlanId: raidPlanEncounters.raidPlanId })
            .from(raidPlanEncounters)
            .where(eq(raidPlanEncounters.id, input.encounterId))
            .limit(1);

          if (encounter.length > 0) {
            const planChars = await ctx.db
              .select({
                id: raidPlanCharacters.id,
                defaultGroup: raidPlanCharacters.defaultGroup,
                defaultPosition: raidPlanCharacters.defaultPosition,
              })
              .from(raidPlanCharacters)
              .where(
                eq(raidPlanCharacters.raidPlanId, encounter[0]!.raidPlanId),
              );

            if (planChars.length > 0) {
              await ctx.db.insert(raidPlanEncounterAssignments).values(
                planChars.map((c) => ({
                  encounterId: input.encounterId,
                  planCharacterId: c.id,
                  groupNumber: c.defaultGroup,
                  position: c.defaultPosition,
                })),
              );
            }
          }
        }
      }

      return { success: true };
    }),

  /**
   * Delete an encounter (cascades to assignments)
   */
  deleteEncounter: raidManagerProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(raidPlanEncounters)
        .where(eq(raidPlanEncounters.id, input.encounterId))
        .returning({ id: raidPlanEncounters.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Encounter not found",
        });
      }

      return { success: true };
    }),

  /**
   * Update a raid plan (name, default AA template, etc.)
   */
  update: raidManagerProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        name: z.string().min(1).max(256).optional(),
        defaultAATemplate: z.string().max(10000).nullable().optional(),
        useDefaultAA: z.boolean().optional(),
        zoneId: z.string().min(1).max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        name: string;
        defaultAATemplate: string | null;
        useDefaultAA: boolean;
        zoneId: string;
      }> = {};

      if (input.name !== undefined) {
        updates.name = input.name;
      }

      if (input.defaultAATemplate !== undefined) {
        updates.defaultAATemplate = input.defaultAATemplate;
      }

      if (input.useDefaultAA !== undefined) {
        updates.useDefaultAA = input.useDefaultAA;
      }

      if (input.zoneId !== undefined) {
        updates.zoneId = input.zoneId;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      const result = await ctx.db
        .update(raidPlans)
        .set(updates)
        .where(eq(raidPlans.id, input.planId))
        .returning({ id: raidPlans.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      // Clean up orphaned AA slot assignments when default template changes
      if (input.defaultAATemplate !== undefined) {
        const slotNames = input.defaultAATemplate
          ? getSlotNames(input.defaultAATemplate)
          : [];

        const conditions = [
          eq(raidPlanEncounterAASlots.raidPlanId, input.planId),
        ];
        if (slotNames.length > 0) {
          conditions.push(
            notInArray(raidPlanEncounterAASlots.slotName, slotNames),
          );
        }

        await ctx.db.delete(raidPlanEncounterAASlots).where(and(...conditions));
      }

      return { success: true };
    }),

  /**
   * Create a new raid plan from Raid-Helper event with matched characters
   */
  create: raidManagerProcedure
    .input(
      z.object({
        raidHelperEventId: z.string(),
        name: z.string().min(1).max(256),
        zoneId: z.string().min(1).max(64),
        startAt: z.date().optional(),
        cloneFromPlanId: z.string().uuid().optional(),
        characters: z.array(
          z.object({
            characterId: z.number().nullable(),
            characterName: z.string(),
            defaultGroup: z.number().nullable(), // 0-indexed group (0-7)
            defaultPosition: z.number().nullable(), // 0-indexed position (0-4)
            writeInClass: z.string().max(32).nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if a plan already exists for this event
      const existing = await ctx.db
        .select({ id: raidPlans.id })
        .from(raidPlans)
        .where(eq(raidPlans.raidHelperEventId, input.raidHelperEventId))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A raid plan already exists for this event",
        });
      }

      return ctx.db.transaction(async (tx) => {
        // Create the plan
        const newPlan = await tx
          .insert(raidPlans)
          .values({
            raidHelperEventId: input.raidHelperEventId,
            name: input.name,
            zoneId: input.zoneId,
            startAt: input.startAt,
            createdById: ctx.session.user.id,
          })
          .returning({ id: raidPlans.id });

        const planId = newPlan[0]!.id;

        // Insert characters if any
        if (input.characters.length > 0) {
          await tx.insert(raidPlanCharacters).values(
            input.characters.map((char) => ({
              raidPlanId: planId,
              characterId: char.characterId,
              characterName: char.characterName,
              writeInClass: char.characterId
                ? null
                : (char.writeInClass ?? null),
              defaultGroup: char.defaultGroup,
              defaultPosition: char.defaultPosition,
            })),
          );
        }

        // If cloning from an existing plan, copy its setup
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
            // Update new plan with source's AA settings
            await tx
              .update(raidPlans)
              .set({
                defaultAATemplate: sourcePlan[0]!.defaultAATemplate,
                useDefaultAA: sourcePlan[0]!.useDefaultAA,
              })
              .where(eq(raidPlans.id, planId));

            // Copy encounters
            const sourceEncounters = await tx
              .select({
                encounterKey: raidPlanEncounters.encounterKey,
                encounterName: raidPlanEncounters.encounterName,
                sortOrder: raidPlanEncounters.sortOrder,
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
                  useDefaultGroups: true, // Always reset to default groups on clone
                  aaTemplate: enc.aaTemplate,
                  useCustomAA: enc.useCustomAA,
                })),
              );
            }
          }
        } else {
          // Fall back to template encounters if an active template exists for this zone (skip for custom zones)
          const template =
            input.zoneId === CUSTOM_ZONE_ID
              ? []
              : await tx
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
            // Update the plan with default AA template from zone template
            // If template exists, automatically enable it
            if (template[0]!.defaultAATemplate) {
              await tx
                .update(raidPlans)
                .set({
                  defaultAATemplate: template[0]!.defaultAATemplate,
                  useDefaultAA: true,
                })
                .where(eq(raidPlans.id, planId));
            }

            const templateEncounters = await tx
              .select({
                encounterKey: raidPlanTemplateEncounters.encounterKey,
                encounterName: raidPlanTemplateEncounters.encounterName,
                sortOrder: raidPlanTemplateEncounters.sortOrder,
                aaTemplate: raidPlanTemplateEncounters.aaTemplate,
              })
              .from(raidPlanTemplateEncounters)
              .where(eq(raidPlanTemplateEncounters.templateId, template[0]!.id))
              .orderBy(raidPlanTemplateEncounters.sortOrder);

            if (templateEncounters.length > 0) {
              await tx.insert(raidPlanEncounters).values(
                templateEncounters.map((enc) => ({
                  raidPlanId: planId,
                  encounterKey: enc.encounterKey,
                  encounterName: enc.encounterName,
                  sortOrder: enc.sortOrder,
                  useDefaultGroups: true,
                  aaTemplate: enc.aaTemplate,
                  useCustomAA: !!enc.aaTemplate, // Enable AA if template exists
                })),
              );
            }
          }
        }

        return { id: planId };
      });
    }),

  /**
   * Search for characters to add/replace in a raid plan
   */
  searchCharacters: raidManagerProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const searchTerm = `%${input.query}%`;

      const results = await ctx.db
        .select({
          characterId: characters.characterId,
          name: characters.name,
          server: characters.server,
          class: characters.class,
        })
        .from(characters)
        .where(
          and(
            eq(characters.isIgnored, false),
            or(
              ilike(characters.name, searchTerm),
              ilike(characters.class, searchTerm),
              ilike(characters.server, searchTerm),
            ),
          ),
        )
        .orderBy(characters.name)
        .limit(input.limit);

      return results;
    }),

  /**
   * Update a raid plan character (replace with different character)
   */
  updateCharacter: raidManagerProcedure
    .input(
      z.object({
        planCharacterId: z.string().uuid(),
        characterId: z.number().nullable(),
        characterName: z.string().min(1).max(128),
        writeInClass: z.string().max(32).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(raidPlanCharacters)
        .set({
          characterId: input.characterId,
          characterName: input.characterName,
          writeInClass: input.characterId ? null : (input.writeInClass ?? null),
        })
        .where(eq(raidPlanCharacters.id, input.planCharacterId))
        .returning({ id: raidPlanCharacters.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plan character not found",
        });
      }

      return { success: true };
    }),

  /**
   * Move a character to a different group/position (for drag-and-drop)
   * Uses fixed slots - no position shifting
   */
  moveCharacter: raidManagerProcedure
    .input(
      z.object({
        planCharacterId: z.string().uuid(),
        targetGroup: z.number().min(0).max(7).nullable(), // null = bench
        targetPosition: z.number().min(0).max(4).nullable(), // null = bench
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(raidPlanCharacters)
        .set({
          defaultGroup: input.targetGroup,
          defaultPosition: input.targetPosition,
        })
        .where(eq(raidPlanCharacters.id, input.planCharacterId))
        .returning({ id: raidPlanCharacters.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plan character not found",
        });
      }

      return { success: true };
    }),

  /**
   * Add a character to a specific slot in a raid plan
   * Use targetGroup: -1 to add to bench (null group/position)
   */
  addCharacter: raidManagerProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        characterId: z.number().nullable(),
        characterName: z.string().min(1).max(128),
        targetGroup: z.number().min(-1).max(7),
        targetPosition: z.number().min(-1).max(4),
        writeInClass: z.string().max(32).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the plan exists
      const plan = await ctx.db
        .select({ id: raidPlans.id })
        .from(raidPlans)
        .where(eq(raidPlans.id, input.planId))
        .limit(1);

      if (plan.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      // -1 means bench (null group/position)
      const isBench = input.targetGroup === -1;

      // Insert the new character
      const newChar = await ctx.db
        .insert(raidPlanCharacters)
        .values({
          raidPlanId: input.planId,
          characterId: input.characterId,
          characterName: input.characterName,
          writeInClass: input.characterId ? null : (input.writeInClass ?? null),
          defaultGroup: isBench ? null : input.targetGroup,
          defaultPosition: isBench ? null : input.targetPosition,
        })
        .returning({
          id: raidPlanCharacters.id,
        });

      return { id: newChar[0]!.id };
    }),

  /**
   * Delete a character from a raid plan
   */
  deleteCharacter: raidManagerProcedure
    .input(
      z.object({
        planCharacterId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(raidPlanCharacters)
        .where(eq(raidPlanCharacters.id, input.planCharacterId))
        .returning({ id: raidPlanCharacters.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plan character not found",
        });
      }

      return { success: true };
    }),

  /**
   * Swap two characters' positions (for cross-group drag-and-drop)
   */
  swapCharacters: raidManagerProcedure
    .input(
      z.object({
        planCharacterIdA: z.string().uuid(),
        planCharacterIdB: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch both characters
      const charsResult = await ctx.db
        .select({
          id: raidPlanCharacters.id,
          defaultGroup: raidPlanCharacters.defaultGroup,
          defaultPosition: raidPlanCharacters.defaultPosition,
        })
        .from(raidPlanCharacters)
        .where(
          or(
            eq(raidPlanCharacters.id, input.planCharacterIdA),
            eq(raidPlanCharacters.id, input.planCharacterIdB),
          ),
        );

      if (charsResult.length !== 2) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both characters not found",
        });
      }

      const charA = charsResult.find((c) => c.id === input.planCharacterIdA)!;
      const charB = charsResult.find((c) => c.id === input.planCharacterIdB)!;

      // Swap their positions atomically
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(raidPlanCharacters)
          .set({
            defaultGroup: charB.defaultGroup,
            defaultPosition: charB.defaultPosition,
          })
          .where(eq(raidPlanCharacters.id, input.planCharacterIdA));

        await tx
          .update(raidPlanCharacters)
          .set({
            defaultGroup: charA.defaultGroup,
            defaultPosition: charA.defaultPosition,
          })
          .where(eq(raidPlanCharacters.id, charB.id));
      });

      return { success: true };
    }),

  /**
   * Move a character to a different group/position within an encounter
   */
  moveEncounterCharacter: raidManagerProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
        planCharacterId: z.string().uuid(),
        targetGroup: z.number().min(0).max(7).nullable(),
        targetPosition: z.number().min(0).max(4).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(raidPlanEncounterAssignments)
        .set({
          groupNumber: input.targetGroup,
          position: input.targetPosition,
        })
        .where(
          and(
            eq(raidPlanEncounterAssignments.encounterId, input.encounterId),
            eq(
              raidPlanEncounterAssignments.planCharacterId,
              input.planCharacterId,
            ),
          ),
        )
        .returning({ id: raidPlanEncounterAssignments.id });

      // Character may not have an encounter assignment yet (e.g. added after
      // custom groups were seeded). Create one on the fly.
      if (result.length === 0) {
        await ctx.db.insert(raidPlanEncounterAssignments).values({
          encounterId: input.encounterId,
          planCharacterId: input.planCharacterId,
          groupNumber: input.targetGroup,
          position: input.targetPosition,
        });
      }

      return { success: true };
    }),

  /**
   * Swap two characters' positions within an encounter
   */
  swapEncounterCharacters: raidManagerProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
        planCharacterIdA: z.string().uuid(),
        planCharacterIdB: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignments = await ctx.db
        .select({
          id: raidPlanEncounterAssignments.id,
          planCharacterId: raidPlanEncounterAssignments.planCharacterId,
          groupNumber: raidPlanEncounterAssignments.groupNumber,
          position: raidPlanEncounterAssignments.position,
        })
        .from(raidPlanEncounterAssignments)
        .where(
          and(
            eq(raidPlanEncounterAssignments.encounterId, input.encounterId),
            inArray(raidPlanEncounterAssignments.planCharacterId, [
              input.planCharacterIdA,
              input.planCharacterIdB,
            ]),
          ),
        );

      // Create missing encounter assignments on the fly for characters added
      // after custom groups were seeded (they start as bench with null positions)
      const missingIds = [
        input.planCharacterIdA,
        input.planCharacterIdB,
      ].filter((id) => !assignments.find((a) => a.planCharacterId === id));

      for (const missingId of missingIds) {
        const inserted = await ctx.db
          .insert(raidPlanEncounterAssignments)
          .values({
            encounterId: input.encounterId,
            planCharacterId: missingId,
            groupNumber: null,
            position: null,
          })
          .returning({
            id: raidPlanEncounterAssignments.id,
            planCharacterId: raidPlanEncounterAssignments.planCharacterId,
            groupNumber: raidPlanEncounterAssignments.groupNumber,
            position: raidPlanEncounterAssignments.position,
          });

        if (inserted[0]) {
          assignments.push(inserted[0]);
        }
      }

      if (assignments.length !== 2) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both encounter assignments not found",
        });
      }

      const assignA = assignments.find(
        (a) => a.planCharacterId === input.planCharacterIdA,
      )!;
      const assignB = assignments.find(
        (a) => a.planCharacterId === input.planCharacterIdB,
      )!;

      // Swap their positions atomically
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(raidPlanEncounterAssignments)
          .set({
            groupNumber: assignB.groupNumber,
            position: assignB.position,
          })
          .where(eq(raidPlanEncounterAssignments.id, assignA.id));

        await tx
          .update(raidPlanEncounterAssignments)
          .set({
            groupNumber: assignA.groupNumber,
            position: assignA.position,
          })
          .where(eq(raidPlanEncounterAssignments.id, assignB.id));
      });

      return { success: true };
    }),

  /**
   * Reset encounter assignments to match the default group configuration.
   * This deletes all custom encounter assignments and recreates them from the default positions.
   */
  resetEncounterToDefault: raidManagerProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the encounter to find the plan ID
      const encounter = await ctx.db
        .select({
          raidPlanId: raidPlanEncounters.raidPlanId,
        })
        .from(raidPlanEncounters)
        .where(eq(raidPlanEncounters.id, input.encounterId))
        .limit(1);

      if (encounter.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Encounter not found",
        });
      }

      const planId = encounter[0]!.raidPlanId;

      // Get all characters in the plan with their default positions
      const planCharacters = await ctx.db
        .select({
          id: raidPlanCharacters.id,
          defaultGroup: raidPlanCharacters.defaultGroup,
          defaultPosition: raidPlanCharacters.defaultPosition,
        })
        .from(raidPlanCharacters)
        .where(eq(raidPlanCharacters.raidPlanId, planId));

      // Delete all existing encounter assignments
      await ctx.db
        .delete(raidPlanEncounterAssignments)
        .where(eq(raidPlanEncounterAssignments.encounterId, input.encounterId));

      // Create new assignments matching default positions
      const newAssignments = planCharacters.map((char) => ({
        encounterId: input.encounterId,
        planCharacterId: char.id,
        groupNumber: char.defaultGroup,
        position: char.defaultPosition,
      }));

      if (newAssignments.length > 0) {
        await ctx.db
          .insert(raidPlanEncounterAssignments)
          .values(newAssignments);
      }

      return { success: true, count: newAssignments.length };
    }),

  // ==========================================================================
  // AngryAssignments (AA) Template Procedures
  // ==========================================================================

  /**
   * Assign a character to an AA slot.
   * For encounter-specific: provide encounterId
   * For default/trash view: provide raidPlanId
   * Characters can be assigned to multiple slots in the same context.
   */
  assignCharacterToAASlot: raidManagerProcedure
    .input(
      z
        .object({
          encounterId: z.string().uuid().optional(),
          raidPlanId: z.string().uuid().optional(),
          planCharacterId: z.string().uuid(),
          slotName: z.string().min(1).max(128),
        })
        .refine((data) => data.encounterId || data.raidPlanId, {
          message: "Either encounterId or raidPlanId must be provided",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const isEncounter = !!input.encounterId;

      // Check if character is already in this specific slot
      const existingCheck = isEncounter
        ? and(
            eq(raidPlanEncounterAASlots.encounterId, input.encounterId!),
            eq(raidPlanEncounterAASlots.planCharacterId, input.planCharacterId),
            eq(raidPlanEncounterAASlots.slotName, input.slotName),
          )
        : and(
            eq(raidPlanEncounterAASlots.raidPlanId, input.raidPlanId!),
            eq(raidPlanEncounterAASlots.planCharacterId, input.planCharacterId),
            eq(raidPlanEncounterAASlots.slotName, input.slotName),
          );

      const existing = await ctx.db
        .select({ id: raidPlanEncounterAASlots.id })
        .from(raidPlanEncounterAASlots)
        .where(existingCheck)
        .limit(1);

      // If already assigned to this slot, return existing ID (no-op)
      if (existing.length > 0) {
        return { id: existing[0]!.id };
      }

      // Get max sort order for this slot
      const whereClause = isEncounter
        ? and(
            eq(raidPlanEncounterAASlots.encounterId, input.encounterId!),
            eq(raidPlanEncounterAASlots.slotName, input.slotName),
          )
        : and(
            eq(raidPlanEncounterAASlots.raidPlanId, input.raidPlanId!),
            eq(raidPlanEncounterAASlots.slotName, input.slotName),
          );

      const maxSortResult = await ctx.db
        .select({ maxSort: max(raidPlanEncounterAASlots.sortOrder) })
        .from(raidPlanEncounterAASlots)
        .where(whereClause);

      const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

      // Insert new assignment
      const result = await ctx.db
        .insert(raidPlanEncounterAASlots)
        .values({
          encounterId: input.encounterId ?? null,
          raidPlanId: input.raidPlanId ?? null,
          planCharacterId: input.planCharacterId,
          slotName: input.slotName,
          sortOrder: nextSortOrder,
        })
        .returning({ id: raidPlanEncounterAASlots.id });

      return { id: result[0]!.id };
    }),

  /**
   * Remove a character from a specific AA slot.
   * For encounter-specific: provide encounterId
   * For default/trash view: provide raidPlanId
   * If slotName is not provided, removes from all slots in the context.
   */
  removeCharacterFromAASlot: raidManagerProcedure
    .input(
      z
        .object({
          encounterId: z.string().uuid().optional(),
          raidPlanId: z.string().uuid().optional(),
          planCharacterId: z.string().uuid(),
          slotName: z.string().min(1).max(128).optional(),
        })
        .refine((data) => data.encounterId || data.raidPlanId, {
          message: "Either encounterId or raidPlanId must be provided",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [
        eq(raidPlanEncounterAASlots.planCharacterId, input.planCharacterId),
      ];

      if (input.encounterId) {
        conditions.push(
          eq(raidPlanEncounterAASlots.encounterId, input.encounterId),
        );
      } else {
        conditions.push(
          eq(raidPlanEncounterAASlots.raidPlanId, input.raidPlanId!),
        );
      }

      // If slotName provided, only remove from that specific slot
      if (input.slotName) {
        conditions.push(eq(raidPlanEncounterAASlots.slotName, input.slotName));
      }

      await ctx.db.delete(raidPlanEncounterAASlots).where(and(...conditions));

      return { success: true };
    }),

  /**
   * Reorder characters within an AA slot.
   * For encounter-specific: provide encounterId
   * For default/trash view: provide raidPlanId
   */
  reorderAASlotCharacters: raidManagerProcedure
    .input(
      z
        .object({
          encounterId: z.string().uuid().optional(),
          raidPlanId: z.string().uuid().optional(),
          slotName: z.string().min(1).max(128),
          planCharacterIds: z.array(z.string().uuid()),
        })
        .refine((data) => data.encounterId || data.raidPlanId, {
          message: "Either encounterId or raidPlanId must be provided",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.planCharacterIds.length === 0) {
        return { success: true };
      }

      // Batch update using CASE/WHEN for all sort orders in a single query
      const cases = input.planCharacterIds.map(
        (id, i) =>
          sql`WHEN ${raidPlanEncounterAASlots.planCharacterId} = ${id} THEN ${sql.raw(String(i))}`,
      );

      const contextFilter = input.encounterId
        ? eq(raidPlanEncounterAASlots.encounterId, input.encounterId)
        : eq(raidPlanEncounterAASlots.raidPlanId, input.raidPlanId!);

      await ctx.db
        .update(raidPlanEncounterAASlots)
        .set({
          sortOrder: sql<number>`CASE ${sql.join(cases, sql` `)} END`,
        })
        .where(
          and(
            contextFilter,
            eq(raidPlanEncounterAASlots.slotName, input.slotName),
            inArray(
              raidPlanEncounterAASlots.planCharacterId,
              input.planCharacterIds,
            ),
          ),
        );

      return { success: true };
    }),

  /**
   * Clear all AA slot assignments for a specific plan character.
   * Used when replacing a character and user chooses to clear assignments.
   */
  clearAAAssignmentsForCharacter: raidManagerProcedure
    .input(
      z.object({
        planCharacterId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(raidPlanEncounterAASlots)
        .where(
          eq(raidPlanEncounterAASlots.planCharacterId, input.planCharacterId),
        );

      return { success: true };
    }),

  /**
   * Transfer all custom encounter group positions from one character to another.
   * For each encounter where fromPlanCharacterId has a non-null group position,
   * assign that position to toPlanCharacterId and bench fromPlanCharacterId.
   */
  transferEncounterAssignments: raidManagerProcedure
    .input(
      z.object({
        fromPlanCharacterId: z.string().uuid(),
        toPlanCharacterId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get all encounter assignments for the source character that have positions
      const fromAssignments = await ctx.db
        .select()
        .from(raidPlanEncounterAssignments)
        .where(
          eq(
            raidPlanEncounterAssignments.planCharacterId,
            input.fromPlanCharacterId,
          ),
        );

      const assignmentsWithPositions = fromAssignments.filter(
        (a) => a.groupNumber !== null && a.position !== null,
      );

      for (const assignment of assignmentsWithPositions) {
        // Update or insert the target character's assignment with the source's position
        const existing = await ctx.db
          .update(raidPlanEncounterAssignments)
          .set({
            groupNumber: assignment.groupNumber,
            position: assignment.position,
          })
          .where(
            and(
              eq(
                raidPlanEncounterAssignments.encounterId,
                assignment.encounterId,
              ),
              eq(
                raidPlanEncounterAssignments.planCharacterId,
                input.toPlanCharacterId,
              ),
            ),
          )
          .returning({ id: raidPlanEncounterAssignments.id });

        if (existing.length === 0) {
          await ctx.db.insert(raidPlanEncounterAssignments).values({
            encounterId: assignment.encounterId,
            planCharacterId: input.toPlanCharacterId,
            groupNumber: assignment.groupNumber,
            position: assignment.position,
          });
        }

        // Bench the source character in this encounter
        await ctx.db
          .update(raidPlanEncounterAssignments)
          .set({ groupNumber: null, position: null })
          .where(eq(raidPlanEncounterAssignments.id, assignment.id));
      }

      return { success: true, transferred: assignmentsWithPositions.length };
    }),

  /**
   * Bench a character in all custom encounter group assignments.
   * Sets groupNumber and position to null for all encounter assignments.
   */
  benchEncounterAssignments: raidManagerProcedure
    .input(
      z.object({
        planCharacterId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(raidPlanEncounterAssignments)
        .set({ groupNumber: null, position: null })
        .where(
          eq(
            raidPlanEncounterAssignments.planCharacterId,
            input.planCharacterId,
          ),
        );

      return { success: true };
    }),

  /**
   * Push default AA slot assignments to all encounters that share matching slot names.
   * When preview=true, returns a summary without making changes.
   * When preview=false (default), performs the push and returns the summary.
   */
  pushDefaultAAAssignments: raidManagerProcedure
    .input(
      z.object({
        raidPlanId: z.string().uuid(),
        preview: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch default AA slot assignments (where raidPlanId is set, encounterId is null)
      const defaultAssignments = await ctx.db
        .select({
          planCharacterId: raidPlanEncounterAASlots.planCharacterId,
          slotName: raidPlanEncounterAASlots.slotName,
          sortOrder: raidPlanEncounterAASlots.sortOrder,
          characterName: raidPlanCharacters.characterName,
        })
        .from(raidPlanEncounterAASlots)
        .innerJoin(
          raidPlanCharacters,
          eq(raidPlanEncounterAASlots.planCharacterId, raidPlanCharacters.id),
        )
        .where(eq(raidPlanEncounterAASlots.raidPlanId, input.raidPlanId));

      if (defaultAssignments.length === 0) {
        return {
          encounters: [] as {
            encounterId: string;
            encounterName: string;
            matchingSlots: string[];
            matchingSlotCount: number;
            slotsWithExisting: number;
            overwrites: {
              slotName: string;
              characterNames: string[];
              newCharacterNames: string[];
            }[];
          }[],
          totalSlotsPushed: 0,
        };
      }

      // Group default assignments by slot name
      const defaultBySlot = new Map<
        string,
        { planCharacterId: string; sortOrder: number; characterName: string }[]
      >();
      for (const a of defaultAssignments) {
        const existing = defaultBySlot.get(a.slotName) ?? [];
        existing.push({
          planCharacterId: a.planCharacterId,
          sortOrder: a.sortOrder,
          characterName: a.characterName,
        });
        defaultBySlot.set(a.slotName, existing);
      }

      // 2. Fetch all encounters with custom AA enabled and a template
      const encounters = await ctx.db
        .select({
          id: raidPlanEncounters.id,
          encounterName: raidPlanEncounters.encounterName,
          aaTemplate: raidPlanEncounters.aaTemplate,
        })
        .from(raidPlanEncounters)
        .where(
          and(
            eq(raidPlanEncounters.raidPlanId, input.raidPlanId),
            eq(raidPlanEncounters.useCustomAA, true),
          ),
        );

      // 3. For each encounter, compute matching slots
      const encounterSummaries: {
        encounterId: string;
        encounterName: string;
        matchingSlots: string[];
        slotsWithExisting: number;
        overwrites: {
          slotName: string;
          characterNames: string[];
          newCharacterNames: string[];
        }[];
      }[] = [];

      // Fetch existing encounter AA assignments for comparison
      const encounterIds = encounters
        .filter((e) => e.aaTemplate)
        .map((e) => e.id);

      let existingEncounterAssignments: {
        encounterId: string | null;
        slotName: string;
        characterName: string;
      }[] = [];

      if (encounterIds.length > 0) {
        existingEncounterAssignments = await ctx.db
          .select({
            encounterId: raidPlanEncounterAASlots.encounterId,
            slotName: raidPlanEncounterAASlots.slotName,
            characterName: raidPlanCharacters.characterName,
          })
          .from(raidPlanEncounterAASlots)
          .innerJoin(
            raidPlanCharacters,
            eq(raidPlanEncounterAASlots.planCharacterId, raidPlanCharacters.id),
          )
          .where(inArray(raidPlanEncounterAASlots.encounterId, encounterIds));
      }

      // Group existing assignments by encounter -> slot -> character names
      const existingByEncounter = new Map<string, Map<string, string[]>>();
      for (const a of existingEncounterAssignments) {
        if (!a.encounterId) continue;
        const slots =
          existingByEncounter.get(a.encounterId) ?? new Map<string, string[]>();
        const names = slots.get(a.slotName) ?? [];
        names.push(a.characterName);
        slots.set(a.slotName, names);
        existingByEncounter.set(a.encounterId, slots);
      }

      for (const encounter of encounters) {
        if (!encounter.aaTemplate) continue;

        const encounterSlotNames = getSlotNames(encounter.aaTemplate);
        const matchingSlots = encounterSlotNames.filter((name) =>
          defaultBySlot.has(name),
        );

        if (matchingSlots.length === 0) continue;

        const existingSlots =
          existingByEncounter.get(encounter.id) ?? new Map<string, string[]>();
        const overwrites: {
          slotName: string;
          characterNames: string[];
          newCharacterNames: string[];
        }[] = [];
        for (const name of matchingSlots) {
          const charNames = existingSlots.get(name);
          if (charNames && charNames.length > 0) {
            const newChars = defaultBySlot.get(name) ?? [];
            overwrites.push({
              slotName: name,
              characterNames: charNames,
              newCharacterNames: newChars.map((c) => c.characterName),
            });
          }
        }

        encounterSummaries.push({
          encounterId: encounter.id,
          encounterName: encounter.encounterName,
          matchingSlots,
          slotsWithExisting: overwrites.length,
          overwrites,
        });
      }

      // 4. If preview mode, return summary without making changes
      if (input.preview) {
        return {
          encounters: encounterSummaries.map((e) => ({
            encounterId: e.encounterId,
            encounterName: e.encounterName,
            matchingSlots: e.matchingSlots,
            matchingSlotCount: e.matchingSlots.length,
            slotsWithExisting: e.slotsWithExisting,
            overwrites: e.overwrites,
          })),
          totalSlotsPushed: encounterSummaries.reduce(
            (sum, e) => sum + e.matchingSlots.length,
            0,
          ),
        };
      }

      // 5. Execute the push within a transaction
      await ctx.db.transaction(async (tx) => {
        for (const summary of encounterSummaries) {
          // Delete existing assignments for matching slots
          for (const slotName of summary.matchingSlots) {
            await tx
              .delete(raidPlanEncounterAASlots)
              .where(
                and(
                  eq(raidPlanEncounterAASlots.encounterId, summary.encounterId),
                  eq(raidPlanEncounterAASlots.slotName, slotName),
                ),
              );
          }

          // Insert default assignments for matching slots
          const valuesToInsert: {
            encounterId: string;
            raidPlanId: null;
            planCharacterId: string;
            slotName: string;
            sortOrder: number;
          }[] = [];

          for (const slotName of summary.matchingSlots) {
            const assignments = defaultBySlot.get(slotName) ?? [];
            for (const a of assignments) {
              valuesToInsert.push({
                encounterId: summary.encounterId,
                raidPlanId: null,
                planCharacterId: a.planCharacterId,
                slotName,
                sortOrder: a.sortOrder,
              });
            }
          }

          if (valuesToInsert.length > 0) {
            await tx.insert(raidPlanEncounterAASlots).values(valuesToInsert);
          }
        }
      });

      return {
        encounters: encounterSummaries.map((e) => ({
          encounterId: e.encounterId,
          encounterName: e.encounterName,
          matchingSlots: e.matchingSlots,
          matchingSlotCount: e.matchingSlots.length,
          slotsWithExisting: e.slotsWithExisting,
          overwrites: e.overwrites,
        })),
        totalSlotsPushed: encounterSummaries.reduce(
          (sum, e) => sum + e.matchingSlots.length,
          0,
        ),
      };
    }),

  /**
   * Refresh a raid plan's characters from updated Raidhelper data.
   * Reconciles existing characters with new list, preserving assignments
   * for characters that remain (by keeping the same raidPlanCharacters.id UUID).
   */
  refreshCharacters: raidManagerProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        mode: z
          .enum(["fullReimport", "addNewSignupsToBench"])
          .default("fullReimport"),
        characters: z.array(
          z.object({
            characterId: z.number().nullable(),
            characterName: z.string(),
            defaultGroup: z.number().nullable(),
            defaultPosition: z.number().nullable(),
            writeInClass: z.string().max(32).nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the plan exists
      const plan = await ctx.db
        .select({ id: raidPlans.id })
        .from(raidPlans)
        .where(eq(raidPlans.id, input.planId))
        .limit(1);

      if (plan.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Raid plan not found",
        });
      }

      // Fetch existing plan characters
      const existing = await ctx.db
        .select({
          id: raidPlanCharacters.id,
          characterId: raidPlanCharacters.characterId,
          characterName: raidPlanCharacters.characterName,
        })
        .from(raidPlanCharacters)
        .where(eq(raidPlanCharacters.raidPlanId, input.planId));

      const matchedExistingIds = new Set<string>();
      const matchedNewIndices = new Set<number>();

      // Maps: newIndex -> existingRecord for matched pairs
      const matches = new Map<
        number,
        { id: string; characterId: number | null; characterName: string }
      >();

      // Pass 1: Match by characterId (non-null only)
      for (let i = 0; i < input.characters.length; i++) {
        const newChar = input.characters[i]!;
        if (newChar.characterId === null) continue;

        const match = existing.find(
          (e) =>
            !matchedExistingIds.has(e.id) &&
            e.characterId === newChar.characterId,
        );
        if (match) {
          matchedExistingIds.add(match.id);
          matchedNewIndices.add(i);
          matches.set(i, match);
        }
      }

      // Pass 2: Match by characterName (case-insensitive) for remaining
      for (let i = 0; i < input.characters.length; i++) {
        if (matchedNewIndices.has(i)) continue;
        const newChar = input.characters[i]!;

        const match = existing.find(
          (e) =>
            !matchedExistingIds.has(e.id) &&
            e.characterName.toLowerCase() ===
              newChar.characterName.toLowerCase(),
        );
        if (match) {
          matchedExistingIds.add(match.id);
          matchedNewIndices.add(i);
          matches.set(i, match);
        }
      }

      const toInsert = input.characters.filter(
        (_, i) => !matchedNewIndices.has(i),
      );

      // If just adding new signups, we don't delete anyone and don't update existing
      const isMergeOnly = input.mode === "addNewSignupsToBench";
      const toDelete = isMergeOnly
        ? []
        : existing
            .filter((e) => !matchedExistingIds.has(e.id))
            .map((e) => e.id);
      const charactersToUpdate = isMergeOnly ? new Map() : matches;

      // Execute all writes in a single transaction
      await ctx.db.transaction(async (tx) => {
        // Update matched records (preserves UUID → preserves all assignments)
        for (const [newIndex, existingRecord] of charactersToUpdate) {
          const newChar = input.characters[newIndex]!;
          await tx
            .update(raidPlanCharacters)
            .set({
              characterId: newChar.characterId,
              characterName: newChar.characterName,
              defaultGroup: newChar.defaultGroup,
              defaultPosition: newChar.defaultPosition,
              writeInClass: newChar.characterId
                ? null
                : (newChar.writeInClass ?? null),
            })
            .where(eq(raidPlanCharacters.id, existingRecord.id));
        }

        // Insert new characters that had no match
        if (toInsert.length > 0) {
          await tx.insert(raidPlanCharacters).values(
            toInsert.map((char) => ({
              raidPlanId: input.planId,
              characterId: char.characterId,
              characterName: char.characterName,
              defaultGroup: isMergeOnly ? null : char.defaultGroup,
              defaultPosition: isMergeOnly ? null : char.defaultPosition,
              writeInClass: char.characterId
                ? null
                : (char.writeInClass ?? null),
            })),
          );
        }

        // Delete existing records that had no match (cascades clean up assignments)
        if (toDelete.length > 0) {
          await tx
            .delete(raidPlanCharacters)
            .where(inArray(raidPlanCharacters.id, toDelete));
        }

        // Reset all encounters back to "use default groups" and delete custom assignments (Full Reimport ONLY)
        if (!isMergeOnly) {
          const customEncounters = await tx
            .select({ id: raidPlanEncounters.id })
            .from(raidPlanEncounters)
            .where(
              and(
                eq(raidPlanEncounters.raidPlanId, input.planId),
                eq(raidPlanEncounters.useDefaultGroups, false),
              ),
            );

          if (customEncounters.length > 0) {
            const customEncounterIds = customEncounters.map((e) => e.id);

            await tx
              .delete(raidPlanEncounterAssignments)
              .where(
                inArray(
                  raidPlanEncounterAssignments.encounterId,
                  customEncounterIds,
                ),
              );

            await tx
              .update(raidPlanEncounters)
              .set({ useDefaultGroups: true })
              .where(inArray(raidPlanEncounters.id, customEncounterIds));
          }
        }
      });

      return {
        added: toInsert.length,
        updated: charactersToUpdate.size,
        removed: toDelete.length,
      };
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
            .update(raidPlanEncounters)
            .set({ sortOrder: enc.sortOrder })
            .where(eq(raidPlanEncounters.id, enc.id));
        }
      });

      return { success: true };
    }),

  /**
   * Get AA slot assignments for a specific plan character.
   * Used to check if a character has assignments before replacing them.
   */
  getAAAssignmentsForCharacter: raidManagerProcedure
    .input(
      z.object({
        planCharacterId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const assignments = await ctx.db
        .select({
          id: raidPlanEncounterAASlots.id,
          encounterId: raidPlanEncounterAASlots.encounterId,
          slotName: raidPlanEncounterAASlots.slotName,
          encounterName: raidPlanEncounters.encounterName,
        })
        .from(raidPlanEncounterAASlots)
        .innerJoin(
          raidPlanEncounters,
          eq(raidPlanEncounterAASlots.encounterId, raidPlanEncounters.id),
        )
        .where(
          eq(raidPlanEncounterAASlots.planCharacterId, input.planCharacterId),
        );

      return assignments;
    }),
});
