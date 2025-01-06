import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { CreateRaid } from "~/components/raids/create-raid";

export default async function RaidIndex() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="mb-8 text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          New Raid
        </h2>
        <div className="h-auto w-full">
          <CreateRaid />
        </div>
      </main>
    </HydrateClient>
  );
}
