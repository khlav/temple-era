"use server";

import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { CreateRaid } from "~/components/raids/create-raid";
import { redirect } from "next/navigation";

export default async function RaidNewPage() {
  const session = await auth();

  if (!session?.user?.isRaidManager) {
    redirect("/raids");
  }

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="h-auto w-full pb-2">
          <CreateRaid />
        </div>
      </main>
    </HydrateClient>
  );
}
