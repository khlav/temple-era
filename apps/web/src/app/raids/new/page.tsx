import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { CreateRaid } from "~/app/_components/raids/raid-new";

export default async function RaidIndex() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h1 className="mb-8 text-center text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          New Raid
        </h1>
        <div className="h-auto w-full">
          <CreateRaid />
        </div>
      </main>
    </HydrateClient>
  );
}
