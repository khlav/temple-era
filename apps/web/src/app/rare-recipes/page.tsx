import React from "react";
import { Separator } from "~/components/ui/separator";
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
    description:
      "Find rare crafted recipes and the characters who can make them.",
    path: "/rare-recipes",
  }),
};

export default async function RecipeManagerIndex() {
  const session = await auth();

  return (
    <main className="w-full">
      <PageHeader
        title="Rare Recipes & Crafters"
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
