import { HydrateClient } from "~/trpc/server";

import {AllCharacters} from "~/components/characters/all-characters";
import {auth} from "~/server/auth";

export default async function PlayersIndex() {
  const session = await auth();
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="text-3xl font-bold tracking-tight">
          Raiding Characters
        </div>
        <div className=" text-muted-foreground mb-2">
          All characters appearing in logs.
        </div>
        <div className="w-full lg:w-3/4 max-h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden">
          <AllCharacters session={session ?? undefined}/>
        </div>
      </main>
    </HydrateClient>
  );
}
