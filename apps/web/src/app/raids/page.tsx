import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import { RaidList } from "~/components/raids/raid-list";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export default async function RaidIndex() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h1 className="mb-8 text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Raids
        </h1>
        <div className="w-full">
          {session?.user?.isAdmin && (
            <div className="pb-4 pl-2">
              <Button asChild className="accent-accent">
                <Link href={`/raids/new`}> + New Raid from WCL link</Link>
              </Button>
            </div>
          )}
          <RaidList />
        </div>
      </main>
    </HydrateClient>
  );
}
