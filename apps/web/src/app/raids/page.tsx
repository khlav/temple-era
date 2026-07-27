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
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Raids",
    description: "Browse tracked raids, attendance, and Warcraft Logs history.",
    path: "/raids",
  }),
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
      <main className="w-full">
        <PageHeader
          title="Raids"
          className="mb-4"
          actions={
            session?.user?.isRaidManager ? (
              <Button asChild className="w-full sm:w-auto">
                <Link href="/raids/new">+ New from Warcraft Logs link</Link>
              </Button>
            ) : null
          }
        />
        <Suspense fallback={<RaidsTableSkeleton rows={10} />}>
          <RaidsListContent session={session} />
        </Suspense>
      </main>
    </HydrateClient>
  );
}
