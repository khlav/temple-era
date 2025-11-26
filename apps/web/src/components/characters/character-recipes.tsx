"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Pencil, Check } from "lucide-react";
import { WOWHeadTooltips } from "~/components/misc/wowhead-tooltips";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { useToast } from "~/hooks/use-toast";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

interface CharacterRecipesProps {
  character: RaidParticipant;
  showRecipeEditor?: boolean;
}

const WOWHEAD_SPELL_URL_BASE = "https://www.wowhead.com/classic/spell=";

export const CharacterRecipes = ({
  character,
  showRecipeEditor = false,
}: CharacterRecipesProps) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const { toast } = useToast();
  const characterId = character.characterId;

  // Fetch character-specific recipes for view mode (lightweight query)
  const { data: characterRecipesData, isLoading: characterRecipesLoading } =
    api.recipe.getRecipesForCharacter.useQuery(characterId, {
      enabled: !isEditMode,
    });

  // Fetch all recipes with character data only when in edit mode (heavier query)
  const { data: allRecipesWithCharacters, isLoading: allRecipesLoading } =
    api.recipe.getAllRecipesWithCharacters.useQuery(undefined, {
      enabled: isEditMode,
    });

  // Group recipes by profession for the character (from character-specific query)
  const characterRecipes = characterRecipesData;

  // Group all recipes by profession
  const recipesByProfession = allRecipesWithCharacters?.reduce(
    (acc, recipe) => {
      acc[recipe.profession] ??= [];
      // @ts-expect-error Should exist
      acc[recipe.profession].push(recipe);
      return acc;
    },
    {} as Record<string, typeof allRecipesWithCharacters>,
  );

  // Group character recipes by profession for view mode
  const characterRecipesByProfession = characterRecipes?.reduce(
    (acc, recipe) => {
      acc[recipe.profession] ??= [];
      // @ts-expect-error Should exist
      acc[recipe.profession].push(recipe);
      return acc;
    },
    {} as Record<string, typeof characterRecipes>,
  );

  // API mutations
  // Get utils for invalidating queries
  const utils = api.useUtils();

  const addRecipeToCharacter = api.recipe.addRecipeToCharacter.useMutation({
    onSuccess: async (data, variables) => {
      // Invalidate both recipe queries to refresh data
      await utils.recipe.getAllRecipesWithCharacters.invalidate();
      await utils.recipe.getRecipesForCharacter.invalidate(characterId);

      // Find recipe name based on spellId
      const recipe =
        allRecipesWithCharacters?.find(
          (r) => r.recipeSpellId === variables.recipeSpellId,
        ) ??
        characterRecipes?.find(
          (r) => r.recipeSpellId === variables.recipeSpellId,
        );
      const recipeName = recipe?.recipe ?? "Recipe";

      const characterName = character.name;

      toast({
        title: "Recipe added",
        description: `Added ${recipeName} to ${characterName}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeRecipeFromCharacter =
    api.recipe.removeRecipeFromCharacter.useMutation({
      onSuccess: async (data, variables) => {
        // Invalidate both recipe queries to refresh data
        await utils.recipe.getAllRecipesWithCharacters.invalidate();
        await utils.recipe.getRecipesForCharacter.invalidate(characterId);

        // Find recipe name based on spellId
        const recipe =
          allRecipesWithCharacters?.find(
            (r) => r.recipeSpellId === variables.recipeSpellId,
          ) ??
          characterRecipes?.find(
            (r) => r.recipeSpellId === variables.recipeSpellId,
          );
        const recipeName = recipe?.recipe ?? "Recipe";

        const characterName = character.name;

        toast({
          title: "Recipe removed",
          description: `Removed ${recipeName} from ${characterName}`,
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });

  // Check if a character knows a recipe
  const characterKnowsRecipe = (recipeSpellId: number) => {
    if (isEditMode) {
      // In edit mode, check against allRecipesWithCharacters
      return allRecipesWithCharacters?.some(
        (recipe) =>
          recipe.recipeSpellId === recipeSpellId &&
          recipe.characters.some((char) => char.characterId === characterId),
      );
    } else {
      // In view mode, check against character-specific recipes
      return characterRecipes?.some(
        (recipe) => recipe.recipeSpellId === recipeSpellId,
      );
    }
  };

  // Handle checkbox change
  const handleRecipeToggle = (recipeSpellId: number, isChecked: boolean) => {
    if (isChecked) {
      addRecipeToCharacter.mutate({
        recipeSpellId,
        characterId,
      });
    } else {
      removeRecipeFromCharacter.mutate({
        recipeSpellId,
        characterId,
      });
    }
  };

  // Handle clicking on recipe name in edit mode
  const handleRecipeClick = (
    recipeSpellId: number,
    event: React.MouseEvent,
  ) => {
    if (isEditMode) {
      event.preventDefault(); // Prevent navigation
      const isCurrentlyChecked = characterKnowsRecipe(recipeSpellId);
      handleRecipeToggle(recipeSpellId, !isCurrentlyChecked);
    }
  };

  const isLoading =
    (isEditMode && allRecipesLoading) ||
    (!isEditMode && characterRecipesLoading);

  if (isLoading) {
    return <div className="py-8 text-center">Loading recipes...</div>;
  }

  return (
    <div className="w-full">
      <WOWHeadTooltips />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-0 pt-4">
          <CardTitle>Crafting & Rare Recipes</CardTitle>
          {showRecipeEditor &&
            (isEditMode ? (
              <Button
                variant="default"
                size="icon"
                onClick={() => setIsEditMode(false)}
                aria-label="Done editing"
              >
                <Check className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="link"
                size="icon"
                onClick={() => setIsEditMode(true)}
                className="border border-primary"
                aria-label="Edit recipes"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ))}
        </CardHeader>
        <CardContent>
          {isEditMode ? (
            // Edit Mode - Show all recipes with checkboxes
            <Accordion type="multiple" className="w-full">
              {Object.entries(recipesByProfession ?? {}).map(
                ([profession, recipes]) => (
                  <AccordionItem key={profession} value={profession}>
                    <AccordionTrigger className="text-sm">
                      {profession}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {recipes.map((recipe) => {
                          const isKnown = characterKnowsRecipe(
                            recipe.recipeSpellId,
                          );
                          return (
                            <div
                              key={recipe.recipeSpellId}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`recipe-${recipe.recipeSpellId}`}
                                checked={isKnown}
                                onCheckedChange={(checked) =>
                                  handleRecipeToggle(
                                    recipe.recipeSpellId,
                                    checked as boolean,
                                  )
                                }
                                disabled={
                                  addRecipeToCharacter.isPending ||
                                  removeRecipeFromCharacter.isPending
                                }
                              />
                              <label
                                htmlFor={`recipe-${recipe.recipeSpellId}`}
                                className="flex-1 cursor-pointer text-sm"
                              >
                                <Link
                                  href={`${WOWHEAD_SPELL_URL_BASE}${recipe.recipeSpellId}`}
                                  target="_blank"
                                  className="hover:underline"
                                  onClick={(e) =>
                                    handleRecipeClick(recipe.recipeSpellId, e)
                                  }
                                >
                                  {recipe.recipe}
                                </Link>
                                {recipe.isCommon && (
                                  <span className="ml-1 text-xs italic text-muted-foreground">
                                    Common
                                  </span>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ),
              )}
            </Accordion>
          ) : (
            // View Mode - Show character's recipes in a table
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profession</TableHead>
                  <TableHead>Recipes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {characterRecipesByProfession &&
                Object.entries(characterRecipesByProfession).length > 0 ? (
                  Object.entries(characterRecipesByProfession).map(
                    ([profession, recipes]) => (
                      <TableRow key={profession}>
                        <TableCell className="font-medium">
                          {profession}
                        </TableCell>
                        <TableCell>
                          <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
                            {recipes.map((recipe) => (
                              <div
                                key={recipe.recipeSpellId}
                                className="text-nowrap text-sm"
                              >
                                <Link
                                  href={`${WOWHEAD_SPELL_URL_BASE}${recipe.recipeSpellId}`}
                                  target="_blank"
                                  className="hover:underline"
                                >
                                  {recipe.recipe}
                                </Link>
                                {recipe.isCommon && (
                                  <span className="ml-1 text-xs italic text-muted-foreground">
                                    Common
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="py-4 text-center text-muted-foreground"
                    >
                      No crafting recipes found for this character.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
