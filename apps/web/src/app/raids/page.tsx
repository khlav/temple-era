import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { AllRaids } from "~/components/raids/all-raids";
import { type Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/raids",
  },
};

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
        <AllRaids session={session ?? undefined} />
      </main>
    </HydrateClient>
  );
}
