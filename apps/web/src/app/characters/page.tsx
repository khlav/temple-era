import { HydrateClient } from "~/trpc/server";

import { AllCharacters } from "~/components/characters/all-characters";
import { auth } from "~/server/auth";
import { type Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function PlayersIndex() {
  const session = await auth();
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="text-3xl font-bold tracking-tight">
          Raiding Characters
        </div>
        <div className="mb-2 text-muted-foreground">
          All characters appearing in logs.
        </div>
        <div className="w-full lg:w-3/4">
          <AllCharacters session={session ?? undefined} />
        </div>
      </main>
    </HydrateClient>
  );
}
