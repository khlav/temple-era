import React from "react";
import {Separator} from "~/components/ui/separator";
import {RecipesWithCrafters} from "~/components/rare-recipes/recipes-with-crafters";

export default async function RecipeManagerIndex() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Rare Recipes & Crafters
      </div>
      <Separator className="my-2" />
      <RecipesWithCrafters />
    </main>
  );
}