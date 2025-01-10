import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import {CharacterList} from "~/components/players/old/characterlist";
import {AllCharacters} from "~/components/players/all-characters";

export default async function PlayersIndex() {
  const session = await auth();


  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="text-3xl font-bold tracking-tight mb-4">
          Players
        </div>
        <div className="w-full lg:w-1/2 max-h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden">
          <AllCharacters />
        </div>
      </main>
    </HydrateClient>
  );
}
