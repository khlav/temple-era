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
} from "drizzle-orm";
import { createTRPCRouter, raidManagerProcedure } from "~/server/api/trpc";
import {
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounters,
  characters,
  raids,
} from "~/server/db/schema";
import { TRPCError } from "@trpc/server";

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
        })
        .from(raidPlans)
        .where(whereClause)
        .orderBy(desc(raidPlans.createdAt))
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

      // Fetch characters with joined character data
      const planCharacters = await ctx.db
        .select({
          id: raidPlanCharacters.id,
          characterId: raidPlanCharacters.characterId,
          characterName: raidPlanCharacters.characterName,
          defaultGroup: raidPlanCharacters.defaultGroup,
          defaultPosition: raidPlanCharacters.defaultPosition,
          // Joined from characters table
          class: characters.class,
          server: characters.server,
        })
        .from(raidPlanCharacters)
        .leftJoin(
          characters,
          eq(raidPlanCharacters.characterId, characters.characterId),
        )
        .where(eq(raidPlanCharacters.raidPlanId, input.planId));

      // Fetch encounters
      const encounters = await ctx.db
        .select({
          id: raidPlanEncounters.id,
          encounterKey: raidPlanEncounters.encounterKey,
          encounterName: raidPlanEncounters.encounterName,
          sortOrder: raidPlanEncounters.sortOrder,
          useDefaultGroups: raidPlanEncounters.useDefaultGroups,
        })
        .from(raidPlanEncounters)
        .where(eq(raidPlanEncounters.raidPlanId, input.planId))
        .orderBy(raidPlanEncounters.sortOrder);

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

      return {
        ...plan[0]!,
        event,
        characters: planCharacters,
        encounters,
      };
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

      // Generate encounter key from name (slugified)
      const encounterKey = input.encounterName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

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
   * Update an encounter (toggle useDefaultGroups or rename)
   */
  updateEncounter: raidManagerProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
        useDefaultGroups: z.boolean().optional(),
        encounterName: z.string().min(1).max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        useDefaultGroups: boolean;
        encounterName: string;
        encounterKey: string;
      }> = {};

      if (input.useDefaultGroups !== undefined) {
        updates.useDefaultGroups = input.useDefaultGroups;
      }

      if (input.encounterName !== undefined) {
        updates.encounterName = input.encounterName;
        updates.encounterKey = input.encounterName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
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
   * Update a raid plan (name only for now)
   */
  update: raidManagerProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        name: z.string().min(1).max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{ name: string }> = {};

      if (input.name !== undefined) {
        updates.name = input.name;
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
        characters: z.array(
          z.object({
            characterId: z.number().nullable(),
            characterName: z.string(),
            defaultGroup: z.number().nullable(), // 0-indexed group (0-7)
            defaultPosition: z.number().nullable(), // 0-indexed position (0-4)
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

      // Create the plan
      const newPlan = await ctx.db
        .insert(raidPlans)
        .values({
          raidHelperEventId: input.raidHelperEventId,
          name: input.name,
          zoneId: input.zoneId,
          createdById: ctx.session.user.id,
        })
        .returning({ id: raidPlans.id });

      const planId = newPlan[0]!.id;

      // Insert characters if any
      if (input.characters.length > 0) {
        await ctx.db.insert(raidPlanCharacters).values(
          input.characters.map((char) => ({
            raidPlanId: planId,
            characterId: char.characterId,
            characterName: char.characterName,
            defaultGroup: char.defaultGroup,
            defaultPosition: char.defaultPosition,
          })),
        );
      }

      return { id: planId };
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(raidPlanCharacters)
        .set({
          characterId: input.characterId,
          characterName: input.characterName,
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

      // Swap their positions
      await ctx.db
        .update(raidPlanCharacters)
        .set({
          defaultGroup: charB.defaultGroup,
          defaultPosition: charB.defaultPosition,
        })
        .where(eq(raidPlanCharacters.id, input.planCharacterIdA));

      await ctx.db
        .update(raidPlanCharacters)
        .set({
          defaultGroup: charA.defaultGroup,
          defaultPosition: charA.defaultPosition,
        })
        .where(eq(raidPlanCharacters.id, input.planCharacterIdB));

      return { success: true };
    }),
});
