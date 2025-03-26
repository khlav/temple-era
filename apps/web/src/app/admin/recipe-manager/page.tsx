import React from "react";
import {Separator} from "~/components/ui/separator";
import {RecipeManager} from "~/components/admin/recipe-manager";

export const dynamic = 'force-dynamic';

export default async function RecipeManagerIndex() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Recipe Manager [WIP: Static for now]
      </div>
      <Separator className="my-2" />
      <RecipeManager />
    </main>
  );
}