import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import {CharacterList} from "~/app/ui/players/characterlist";

export default async function PlayersIndex() {
  const session = await auth();


  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h1 className="text-center text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
          Players
        </h1>
        <div className="w-full">
          <CharacterList />
        </div>
      </main>
    </HydrateClient>
  );
}
