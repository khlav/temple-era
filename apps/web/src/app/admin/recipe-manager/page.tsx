import { HydrateClient } from "~/trpc/server";

import { auth } from "~/server/auth";
import { RecipeSearch } from "~/components/admin/recipe-manager/recipe-search";

export default async function RecipeManagerIndex() {
  // const session = await auth();
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="mb-4 text-3xl font-bold tracking-tight">
          Recipe Manager
        </div>
        <RecipeSearch />
      </main>
    </HydrateClient>
  );
}
