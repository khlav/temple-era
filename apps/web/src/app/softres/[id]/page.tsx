import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HydrateClient } from "~/trpc/server";
import { SoftResScanContent } from "~/components/softres/softres-scan-content";
import { SoftResScanSkeleton } from "~/components/softres/softres-scan-skeleton";
import { type Metadata } from "next";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "SoftRes Scan - Temple Raid Attendance",
  description:
    "Checks characters and their soft reserves against attendance constraints and other rules + information.",
  robots: {
    index: false,
    follow: false,
  },
};

async function SoftResScanContentServer({ raidId }: { raidId: string }) {
  // Fetch data using tRPC on the server
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const data = await caller.softres.getSoftResRaidData(raidId);

  return <SoftResScanContent data={data} />;
}

export default async function SoftResScanResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const p = await params;
  const raidId = p.id;

  // Check if user is raid manager
  if (!session?.user?.isRaidManager) {
    redirect("/");
  }

  return (
    <HydrateClient>
      <main className="w-full px-4">
        <div className="mb-2 text-3xl font-bold tracking-tight">
          SoftRes Scan
        </div>
        <div className="mb-4 text-sm text-muted-foreground">
          Checks characters and their soft reserves against attendance
          constraints and other rules + information.
          <span className="block mt-1 text-amber-600 dark:text-amber-400">
            ⚠️ Note: Attendance values are <strong>current attendance</strong>{" "}
            and may not be accurate for older raids.
          </span>
        </div>

        <Suspense fallback={<SoftResScanSkeleton />}>
          <SoftResScanContentServer raidId={raidId} />
        </Suspense>
      </main>
    </HydrateClient>
  );
}
