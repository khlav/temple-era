import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { RaidLogLoader } from "~/components/raids/raidlog-loader";

export default async function RaidPage() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-8">
          Raid Log Import
        </h2>
        <div className="w-full">
          <RaidLogLoader label="Enter a WCL report URL to add/refresh the log and participating characters." forceRefresh/>
        </div>
      </main>
    </HydrateClient>
  );
}
