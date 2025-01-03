import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import { RaidList } from "~/app/ui/raids/raidlist";

export default async function RaidIndex() {
  const session = await auth();


  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h1 className="text-center text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
          Raids
        </h1>
        <div className="w-full">
          <RaidList />
        </div>
      </main>
    </HydrateClient>
  );
}
