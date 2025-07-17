// src/server/api/routers/recipes.ts
import { z } from "zod";
import {adminProcedure, createTRPCRouter, protectedProcedure, publicProcedure} from "~/server/api/trpc";
import { recipes, characterRecipeMap } from "~/server/db/schema";
import { characters } from "~/server/db/models/raid-schema";
import {and, eq, sql} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type {
  Recipe,
  NewRecipe,
  RecipeWithCharacters,
  RecipeResponse,
  CharacterRecipeMappingResponse
} from "~/server/api/interfaces/recipe";

export const recipe = createTRPCRouter({
  getAllRecipes: publicProcedure.query(async ({ ctx }): Promise<Recipe[]> => {
    return await ctx.db.query.recipes.findMany({
      orderBy: (recipes, { asc }) => [asc(sql<string>`CAST(${recipes.profession} as TEXT)`), asc(recipes.recipe)],
    });
  }),

  getAllRecipesWithCharacters: publicProcedure.query(async ({ ctx }): Promise<RecipeWithCharacters[]> => {
    // Fetch all recipes with their related characters
    const allRecipes = await ctx.db.query.recipes.findMany({
      orderBy: (recipes, { asc }) => [asc(sql<string>`CAST(${recipes.profession} as TEXT)`), asc(recipes.recipe)],
      with: {
        characterRecipes: {
          with: {
            character: {
              with: {
                primaryCharacter: true
              }
            },
          },
        },
      },
    });

    // Map the results to include characters as an array
    return allRecipes.map((recipe) => ({
      ...recipe,
      characters: recipe
        .characterRecipes.map((cr) => cr.character)
        .sort((a,b) => a.name > b.name ? 1 : -1),
      characterRecipes: undefined,
    })) as RecipeWithCharacters[];
  }),

  addRecipe: adminProcedure
    .input(
      z.object({
        recipeSpellId: z.number(),
        itemId: z.number().optional(),
        profession: z.enum(['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Tailoring', 'Leatherworking']),
        recipe: z.string(),
        isCommon: z.boolean().default(false),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }): Promise<RecipeResponse> => {
      const session = ctx.session;

      // Check if recipe already exists
      const existingRecipe = await ctx.db.query.recipes.findFirst({
        where: eq(recipes.recipeSpellId, input.recipeSpellId),
      });

      if (existingRecipe) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Recipe with this spell ID already exists",
        });
      }

      // Create a NewRecipe object using our inferred type
      const newRecipe: NewRecipe = {
        recipeSpellId: input.recipeSpellId,
        itemId: input.itemId,
        profession: input.profession,
        recipe: input.recipe,
        isCommon: input.isCommon,
        notes: input.notes,
        tags: input.tags,
        createdById: session.user.id,
        updatedById: session.user.id,
      };

      // Insert the new recipe
      const result = await ctx.db.insert(recipes).values(newRecipe).returning();

      return {
        success: true,
        message: "Recipe added successfully",
        data: result[0]
      };
    }),

  deleteRecipe: adminProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }): Promise<RecipeResponse> => {
      // Check if recipe exists
      const existingRecipe = await ctx.db.query.recipes.findFirst({
        where: eq(recipes.recipeSpellId, input),
      });

      if (!existingRecipe) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipe not found",
        });
      }

      // Delete related character recipe mappings first to maintain referential integrity
      await ctx.db
        .delete(characterRecipeMap)
        .where(eq(characterRecipeMap.recipeSpellId, input));

      // Delete the recipe
      const result = await ctx.db
        .delete(recipes)
        .where(eq(recipes.recipeSpellId, input))
        .returning();

      return {
        success: true,
        message: "Recipe and all character mappings deleted successfully",
        data: result[0]
      };
    }),

  addRecipeToCharacter: protectedProcedure
    .input(
      z.object({
        recipeSpellId: z.number(),
        characterId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }): Promise<CharacterRecipeMappingResponse> => {
      const session = ctx.session;

      // Verify the recipe exists
      const recipeExists = await ctx.db.query.recipes.findFirst({
        where: eq(recipes.recipeSpellId, input.recipeSpellId),
      });

      if (!recipeExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipe not found",
        });
      }

      // Verify the character exists
      const characterExists = await ctx.db.query.characters.findFirst({
        where: eq(characters.characterId, input.characterId),
      });

      if (!characterExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Character not found",
        });
      }

      // Check if mapping already exists
      const existingMapping = await ctx.db.query.characterRecipeMap.findFirst({
        where: and(
          eq(characterRecipeMap.recipeSpellId, input.recipeSpellId),
          eq(characterRecipeMap.characterId, input.characterId)
        ),
      });

      if (existingMapping) {
        return {
          success: true,
          message: "Recipe already assigned to character",
          data: existingMapping
        };
      }

      // Insert the new mapping
      const result = await ctx.db.insert(characterRecipeMap).values({
        characterId: input.characterId,
        recipeSpellId: input.recipeSpellId,
        createdById: session.user.id,
        updatedById: session.user.id,
      }).returning();

      return {
        success: true,
        message: "Recipe added to character successfully",
        data: result[0]
      };
    }),

  removeRecipeFromCharacter: protectedProcedure
    .input(
      z.object({
        recipeSpellId: z.number(),
        characterId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }): Promise<CharacterRecipeMappingResponse> => {
      // Delete the mapping
      const result = await ctx.db
        .delete(characterRecipeMap)
        .where(
          and(
            eq(characterRecipeMap.recipeSpellId, input.recipeSpellId),
            eq(characterRecipeMap.characterId, input.characterId)
          )
        )
        .returning();

      if (result.length === 0) {
        return {
          success: false,
          message: "Recipe mapping not found"
        };
      }

      return {
        success: true,
        message: "Recipe removed from character successfully",
        data: result[0]
      };
    }),
});
