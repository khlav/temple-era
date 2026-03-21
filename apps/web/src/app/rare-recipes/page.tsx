import React from "react";
import { Separator } from "~/components/ui/separator";
import { RecipesWithCrafters } from "~/components/rare-recipes/recipes-with-crafters";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { PageHeader } from "~/components/ui/page-header";

export const metadata: Metadata = {
  alternates: {
    canonical: "/rare-recipes",
  },
};

export default async function RecipeManagerIndex() {
  const session = await auth();

  return (
    <main className="w-full">
      <PageHeader
        title="Rare Recipes & Crafters"
        description="Find who can craft rare items, filter by tags, and browse Temple's profession coverage."
        actions={
          !!session?.user ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/characters">+ Add recipes to a character</Link>
            </Button>
          ) : null
        }
      />
      <Separator className="my-2" />
      <RecipesWithCrafters />
    </main>
  );
}
