import React from "react";
import {Separator} from "~/components/ui/separator";
import {RecipesWithCrafters} from "~/components/rare-recipes/recipes-with-crafters";
import {Button} from "~/components/ui/button";
import Link from "next/link";
import {auth} from "~/server/auth";

export default async function RecipeManagerIndex() {
  const session = await auth();

  return (
    <main className="w-full px-4">
      <div className="flex gap-4">
        <div className="grow-0 pb-4 text-3xl font-bold">Rare Recipes & Crafters</div>
        <div className="grow text-right">
          {!!session?.user && (
            <Button asChild className="accent-accent">
              <Link href={`/characters`}> + Add recipes to a character</Link>
            </Button>
          )}
        </div>
      </div>
      <Separator className="my-2"/>
      <RecipesWithCrafters/>
    </main>
  );
}