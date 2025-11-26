import { HydrateClient } from "~/trpc/server";
import { Suspense } from "react";

import { AllCharacters } from "~/components/characters/all-characters";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { AllCharactersTableSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

async function CharactersListContent({ session }: { session: Session | null }) {
  // Fetch characters data using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const characters = await caller.character.getCharacters(undefined);

  return (
    <AllCharacters characters={characters} session={session ?? undefined} />
  );
}

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
          <Suspense fallback={<AllCharactersTableSkeleton rows={14} />}>
            <CharactersListContent session={session} />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}
