import { RaidPageWrapper } from "~/components/raids/raid-page-wrapper";
import { auth } from "~/server/auth";
import {
  getRaidMetadataWithStats,
  generateRaidMetadata,
} from "~/server/metadata-helpers";
import { type Metadata } from "next";
import { cache, Suspense } from "react";
import { RaidDetailSkeleton } from "~/components/raids/skeletons";
import type { Session } from "next-auth";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";
// import { MetadataDebug } from "~/components/debug/metadata-debug"; // Uncomment to enable debug

// Cache the raid data fetch to avoid duplicate calls between generateMetadata and page component
const getCachedRaidData = cache(async (raidId: number) => {
  return await getRaidMetadataWithStats(raidId);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ raidId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const raidId = parseInt(String(p.raidId));
  const raidData = await getCachedRaidData(raidId);

  const metadata = generateRaidMetadata(raidData, raidId);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: metadata.openGraph,
    alternates: {
      canonical: `/raids/${raidId}`,
    },
    other: {
      "application/ld+json": JSON.stringify(metadata.structuredData),
    },
  };
}

async function RaidPageContent({
  raidId,
  session,
}: {
  raidId: number;
  session: Session | null;
}) {
  // Fetch raid data using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const raidData = await caller.raid.getRaidById(raidId);

  if (!raidData) {
    return <div>Raid not found</div>;
  }

  // Get raid name for breadcrumb from the fetched data
  const raidName = raidData.name;

  return (
    <>
      <RaidPageWrapper
        raidId={raidId}
        raidData={raidData}
        showEditButton={session?.user?.isRaidManager}
        initialBreadcrumbData={
          raidName ? { [raidId.toString()]: raidName } : {}
        }
      />
      {/* <MetadataDebug raidId={raidId} /> Uncomment to enable debug */}
    </>
  );
}

export default async function RaidPage({
  params,
}: {
  params: Promise<{ raidId: number }>;
}) {
  const p = await params;
  const raidId = parseInt(String(p.raidId));
  const session = await auth();

  return (
    <Suspense fallback={<RaidDetailSkeleton />}>
      <RaidPageContent raidId={raidId} session={session} />
    </Suspense>
  );
}
