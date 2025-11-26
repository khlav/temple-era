import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Suspense } from "react";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { AllRaids } from "~/components/raids/all-raids";
import { type Metadata } from "next";
import { RaidsTableSkeleton } from "~/components/raids/skeletons";
import type { Session } from "next-auth";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";

export const metadata: Metadata = {
  alternates: {
    canonical: "/raids",
  },
};

async function RaidsListContent({ session }: { session: Session | null }) {
  // Fetch raids data using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const raids = await caller.raid.getRaids();

  return <AllRaids raids={raids} session={session ?? undefined} />;
}

export default async function RaidIndex() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="flex gap-4">
          <div className="grow-0 pb-4 text-3xl font-bold">Raids</div>
          <div className="grow text-right">
            {session?.user?.isRaidManager && (
              <Button asChild className="accent-accent">
                <Link href={`/raids/new`}> + New from Warcraft Logs link</Link>
              </Button>
            )}
          </div>
        </div>
        <Suspense fallback={<RaidsTableSkeleton rows={10} />}>
          <RaidsListContent session={session} />
        </Suspense>
      </main>
    </HydrateClient>
  );
}
