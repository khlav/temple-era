// ArtisansByProfession.tsx
"use client"

import { useMemo } from "react";
import { Badge } from "~/components/ui/badge";
import type { RecipeWithCharacters } from "~/server/api/interfaces/recipe";

type ArtisansByProfessionProps = {
  recipes: RecipeWithCharacters[] | undefined;
};

export const ArtisansByProfession = ({ recipes }: ArtisansByProfessionProps) => {
  // Find artisans (characters who know all recipes within a profession)
  const artisansByProfession = useMemo(() => {
    if (!recipes?.length) return {};

    // Group recipes by profession
    const professionGroups: Record<string, RecipeWithCharacters[]> = {};
    recipes.forEach(recipe => {
      if (!professionGroups[recipe.profession]) {
        professionGroups[recipe.profession] = [];
      }
      (professionGroups[recipe.profession] ?? []).push(recipe);
    });

    // For each profession, find characters who know all non-common recipes
    const artisans: Record<string, string[]> = {};

    Object.entries(professionGroups).forEach(([profession, professionRecipes]) => {
      // Get all non-common recipes for this profession
      const nonCommonRecipes = professionRecipes.filter(recipe => !recipe.isCommon);

      if (nonCommonRecipes.length === 0) {
        // If all recipes are common, no artisans to track
        return;
      }

      // Get all characters that know at least one recipe in this profession
      const allCharacters: Record<string, { id: number, name: string, recipeCount: number }> = {};

      nonCommonRecipes.forEach(recipe => {
        recipe.characters?.forEach(character => {
          if (!allCharacters[character.characterId]) {
            allCharacters[character.characterId] = {
              id: character.characterId,
              name: character.name || 'Unknown',
              recipeCount: 0
            };
          }
          // @ts-expect-error should never be null
          allCharacters[character.characterId ?? -1].recipeCount++;
        });
      });

      // Find characters who know all non-common recipes
      const professionArtisans = Object.values(allCharacters)
        .filter(character => character.recipeCount === nonCommonRecipes.length)
        .map(character => character.name)
        .sort();

      if (professionArtisans.length > 0) {
        artisans[profession] = professionArtisans;
      }
    });

    return artisans;
  }, [recipes]);

  // If no artisans or no recipes, don't render the component
  if (!recipes?.length || Object.keys(artisansByProfession).length === 0) {
    return null;
  }

  // Get sorted profession names
  const professions = Object.keys(artisansByProfession).sort();

  return (
    <div className="hidden md:block border rounded-md p-4 bg-card">
      <div className="font-medium mb-2">Artisans <span className="text-sm text-muted-foreground">with all recipes for their profession.</span></div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {professions.map(profession => (
          <div key={profession} className="space-y-2">
            <h3 className="font-medium text-sm">{profession}</h3>
            <div className="space-y-1">
              {(artisansByProfession[profession] ?? []).length > 0 ? (
                (artisansByProfession[profession] ?? []).map(name => (
                  <Badge
                    key={`${profession}-${name}`}
                    variant="secondary"
                    className="mr-1 mb-1 text-xs"
                  >
                    {name}
                  </Badge>
                ))
              ) : (
                <div className="text-xs text-muted-foreground italic">No artisans</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};