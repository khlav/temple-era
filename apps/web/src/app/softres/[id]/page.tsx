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
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "SoftRes Scan",
    description:
      "Check characters and their soft reserves against attendance constraints and guild rules.",
    noIndex: true,
  }),
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
          [Beta] SoftRes Scan
        </div>
        <div className="mb-4 text-sm text-muted-foreground">
          Checks characters and their soft reserves against attendance
          constraints and other rules + information.
          <span className="mt-1 block text-amber-600 dark:text-amber-400">
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
