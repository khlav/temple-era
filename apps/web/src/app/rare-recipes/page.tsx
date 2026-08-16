import React from "react";
import { RecipesWithCrafters } from "~/components/rare-recipes/recipes-with-crafters";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Rare Recipes",
    description: "Find rare crafted recipes and the characters who can make them.",
    path: "/rare-recipes",
  }),
};

export default async function RecipeManagerIndex() {
  const session = await auth();

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Crafting"
        title="Rare Recipes & Crafters"
        className="mb-4"
        actions={
          session?.user ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/characters">+ Add recipes to a character</Link>
            </Button>
          ) : null
        }
      />
      <RecipesWithCrafters />
    </main>
  );
}
