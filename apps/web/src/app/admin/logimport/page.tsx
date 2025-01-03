import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import { RaidImporter } from "~/app/ui/raids/raid";

export default async function RaidPage() {
  const session = await auth();


  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h1 className="text-center text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
          Raids
        </h1>
        <div className="w-full">
          <RaidImporter />
        </div>
      </main>
    </HydrateClient>
  );
}
