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

async function CharactersListContent({
  session,
  initialSearchTerm,
}: {
  session: Session | null;
  initialSearchTerm?: string;
}) {
  // Fetch characters + rolling attendance using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const [characters, attendance] = await Promise.all([
    caller.character.getCharacters(undefined),
    caller.character.getAllPrimaryRaidAttendanceL6LockoutWk(),
  ]);

  const totalCount = Object.keys(characters).length;
  const mainsCount = Object.values(characters).filter((c) => c.isPrimary).length;

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Raiding Characters"
        meta={
          <span>
            {totalCount} characters · {mainsCount} mains
          </span>
        }
        className="mb-4"
      />
      <AllCharacters
        characters={characters}
        attendance={attendance}
        session={session ?? undefined}
        initialSearchTerm={initialSearchTerm}
      />
    </>
  );
}

export default async function PlayersIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  const { q } = await searchParams;
  return (
    <HydrateClient>
      <main className="w-full">
        <div className="w-full">
          <Suspense fallback={<AllCharactersTableSkeleton rows={14} />}>
            <CharactersListContent session={session} initialSearchTerm={q} />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}
