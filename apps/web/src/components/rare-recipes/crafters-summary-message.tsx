// CraftersSummaryMessage.tsx
"use client"

import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import type { RecipeWithCharacters } from "~/server/api/interfaces/recipe";

type CraftersSummaryProps = {
  filteredRecipes: RecipeWithCharacters[];
  searchPerformed: boolean;
};

export const CraftersSummaryMessage = ({
                                         filteredRecipes,
                                         searchPerformed
                                       }: CraftersSummaryProps) => {
  // Find crafters who can make all items in the filtered list
  const completeCrafters = useMemo(() => {
    // Only process if we have valid recipes
    if (!searchPerformed || filteredRecipes.length === 0) {
      return [];
    }

    // Skip recipes without characters (like common recipes)
    const allRecipesHaveCharacters = filteredRecipes.every(recipe =>
      recipe.characters && recipe.characters.length > 0
    );
    if (!allRecipesHaveCharacters) {
      return [];
    }

    // Track crafters and the recipes they can make
    const crafterMap: Record<string, {
      name: string;
      recipeCount: number;
    }> = {};

    // Count recipes each crafter can make
    filteredRecipes.forEach(recipe => {
      // Skip recipes without characters
      if (!recipe.characters || recipe.characters.length === 0) {
        return;
      }

      recipe.characters.forEach(character => {
        const characterId = character.characterId;
        if (!characterId) return; // Skip if characterId is undefined

        if (!crafterMap[characterId]) {
          crafterMap[characterId] = {
            name: character.name || "Unknown",
            recipeCount: 0
          };
        }
        crafterMap[characterId].recipeCount++;
      });
    });

    // Find crafters who can make all recipes
    const completeList = Object.values(crafterMap)
      .filter(crafter => crafter.recipeCount === filteredRecipes.length)
      .map(crafter => crafter.name)
      .sort();

    return completeList;
  }, [filteredRecipes, searchPerformed]);

  // Only show if conditions are met
  if (!searchPerformed ||
    filteredRecipes.length === 0 ||
    completeCrafters.length === 0) {
    return null;
  }

  // Format the crafter names for display
  const formatCraftersList = () => {
    const boldName = (name: string) => <span className="font-medium text-secondary-foreground">{name}</span>;

    if (completeCrafters.length === 1) {
      return boldName(completeCrafters[0] ?? "");
    } else if (completeCrafters.length === 2) {
      return (
        <>{boldName(completeCrafters[0] ?? "")} and {boldName(completeCrafters[1] ?? "")}</>
      );
    } else {
      return (
        <>
          {completeCrafters.slice(0, -1).map((name, index) => (
            <span key={index}>
              {boldName(name)}
              {index < completeCrafters.length - 2 ? ", " : ""}
            </span>
          ))}
          {", and "}
          {boldName(completeCrafters[completeCrafters.length - 1] ?? "")}
        </>
      );
    }
  };

  return (
    <Alert variant="default" className="bg-secondary border-chart-2">
      <div className="flex gap-2">
        <AlertCircle className="h-4 w-4 text-chart-2" />
        <AlertDescription className="text-muted-foreground">
          <span>{formatCraftersList()}</span> can make all items in your search.
        </AlertDescription>
      </div>
    </Alert>
  );
};
