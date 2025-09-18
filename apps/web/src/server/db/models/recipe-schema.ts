// src/db/schema/recipes.ts
import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { characters } from "~/server/db/models/raid-schema";
import { CreatedBy, DefaultTimestamps, UpdatedBy } from "~/server/db/helpers";

// Enum for profession types
export const professionEnum = pgEnum("profession", [
  "Alchemy",
  "Blacksmithing",
  "Enchanting",
  "Engineering",
  "Tailoring",
  "Leatherworking",
  "Cooking",
]);

// Recipes table
export const recipes = pgTable("recipes", {
  recipeSpellId: integer("recipe_spell_id").primaryKey(),
  itemId: integer("item_id"),
  profession: professionEnum("profession").notNull(),
  recipe: text("recipe").notNull(),
  isCommon: boolean("is_common").notNull().default(false),
  notes: text("notes"),
  tags: text("tags").array(),
  ...CreatedBy,
  ...UpdatedBy,
  ...DefaultTimestamps,
});

// Relations for recipes
export const recipesRelations = relations(recipes, ({ many }) => ({
  characterRecipes: many(characterRecipeMap),
}));

// Character to spell (recipe) relation table
export const characterRecipeMap = pgTable(
  "character_spells",
  {
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.characterId),
    recipeSpellId: integer("recipe_spell_id")
      .notNull()
      .references(() => recipes.recipeSpellId),
    ...CreatedBy,
    ...UpdatedBy,
    ...DefaultTimestamps,
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.characterId, table.recipeSpellId] }),
    };
  },
);

// Relations for character spells
export const characterRecipeMapRelations = relations(
  characterRecipeMap,
  ({ one }) => ({
    character: one(characters, {
      fields: [characterRecipeMap.characterId],
      references: [characters.characterId],
    }),
    recipe: one(recipes, {
      fields: [characterRecipeMap.recipeSpellId],
      references: [recipes.recipeSpellId],
    }),
  }),
);
