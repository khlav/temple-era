// src/server/api/types/recipe-types.ts
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { recipes, characterRecipeMap } from "~/server/db/schema";
import type { characters } from "~/server/db/models/raid-schema";

// Infer select types (what you get from queries)
export type Recipe = InferSelectModel<typeof recipes>;
export type Character = InferSelectModel<typeof characters>;
export type CharacterRecipeMapping = InferSelectModel<
  typeof characterRecipeMap
>;

// Infer insert types (what you use for inserts)
export type NewRecipe = InferInsertModel<typeof recipes>;
export type NewCharacterRecipeMapping = InferInsertModel<
  typeof characterRecipeMap
>;

// Response types for mutations
export interface MutationResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

// Extended types for combined data
export interface RecipeWithCharacters extends Recipe {
  characters: Character[];
}

// Response type helpers
export type RecipeResponse = MutationResponse<Recipe>;
export type CharacterRecipeMappingResponse =
  MutationResponse<CharacterRecipeMapping>;
