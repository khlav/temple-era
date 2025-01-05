import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

import { RaidList } from "~/app/_components/raids/raid-list";
import Link from "next/link";

export default async function RaidIndex() {
  const session = await auth();


  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h1 className="text-center text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
          Raids
        </h1>
        <div className="w-full">
          { session?.user?.isAdmin && (
          <div className="pl-2 pb-4">
            <Link
              href={`/raids/new`}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-900 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
             + New Raid from WCL link
            </Link>
          </div>
            )}
          <RaidList />
        </div>
      </main>
    </HydrateClient>
  );
}
