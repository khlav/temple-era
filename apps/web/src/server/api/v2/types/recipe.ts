// src/server/api/v2/types/recipe.ts
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  characters,
  characterRecipeMap,
  primaryRaidAttendanceL6LockoutWk,
} from "~/server/db/schema";
import { RecipeRef, RecipeCrafterRef, CharacterRef } from "../refs";
import { ProfessionEnum, DB_PROFESSION_TO_GQL, type ProfessionValues } from "./enums";
import { requireUser } from "../context";

RecipeRef.implement({
  fields: (t) => ({
    spellId: t.exposeInt("recipeSpellId"),
    itemId: t.exposeInt("itemId", { nullable: true }),
    name: t.exposeString("recipe"),
    isCommon: t.exposeBoolean("isCommon"),
    notes: t.exposeString("notes", { nullable: true }),
    tags: t.field({
      type: ["String"],
      resolve: (r) => r.tags ?? [],
    }),
    profession: t.field({
      type: ProfessionEnum,
      resolve: (r) => (DB_PROFESSION_TO_GQL[r.profession] ?? "ALCHEMY") as ProfessionValues,
    }),
    crafters: t.field({
      type: [RecipeCrafterRef],
      args: {
        includeInactive: t.arg.boolean({ required: false }),
      },
      resolve: async (recipe, args, ctx) => {
        requireUser(ctx);
        const primaryChar = alias(characters, "primary_char");

        const [crafterRows, activeRows] = await Promise.all([
          ctx.db
            .select({ character: characters, primaryIsIgnored: primaryChar.isIgnored })
            .from(characterRecipeMap)
            .innerJoin(characters, eq(characterRecipeMap.characterId, characters.characterId))
            .leftJoin(primaryChar, eq(characters.primaryCharacterId, primaryChar.characterId))
            .where(eq(characterRecipeMap.recipeSpellId, recipe.recipeSpellId)),
          ctx.db
            .select({ characterId: primaryRaidAttendanceL6LockoutWk.characterId })
            .from(primaryRaidAttendanceL6LockoutWk),
        ]);

        const activeIds = new Set(activeRows.map((r) => r.characterId));

        return crafterRows
          .filter((r) => !r.character.isIgnored && r.primaryIsIgnored !== true)
          .map((r) => ({
            character: r.character,
            isActiveRaider: activeIds.has(
              r.character.primaryCharacterId ?? r.character.characterId,
            ),
          }))
          .filter((r) => args.includeInactive === true || r.isActiveRaider)
          .sort((a, b) => (a.character.name ?? "").localeCompare(b.character.name ?? ""));
      },
    }),
  }),
});

RecipeCrafterRef.implement({
  fields: (t) => ({
    character: t.field({ type: CharacterRef, resolve: (r) => r.character }),
    isActiveRaider: t.exposeBoolean("isActiveRaider"),
  }),
});
