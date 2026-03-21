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
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Characters",
    description: "View Temple's raiding roster, attendance, and linked alts.",
    path: "/characters",
    noIndex: true,
  }),
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
      <main className="w-full">
        <PageHeader title="Raiding Characters" className="mb-4" />
        <div className="w-full">
          <Suspense fallback={<AllCharactersTableSkeleton rows={14} />}>
            <CharactersListContent session={session} />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}
