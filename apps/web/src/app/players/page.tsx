import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import {CharacterList} from "~/components/players/characterlist";

export default async function PlayersIndex() {
  const session = await auth();


  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
          Players
        </h2>
        <div className="w-full">
          <CharacterList />
        </div>
      </main>
    </HydrateClient>
  );
}
