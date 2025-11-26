import { auth } from "~/server/auth";
import { RaidEditPageWrapper } from "~/components/raids/raid-edit-page-wrapper";
import { redirect } from "next/navigation";
import { getRaidMetadataWithStats } from "~/server/metadata-helpers";
import { type Metadata } from "next";
import { cache, Suspense } from "react";
import { RaidEditSkeleton } from "~/components/raids/skeletons";
import type { Session } from "next-auth";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";

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

  if (!raidData) {
    return {
      title: `Temple Raid Attendance - Raids - ${raidId} - Edit`,
      description: `Edit raid details for raid ${raidId}`,
    };
  }

  const title = `Temple Raid Attendance - ${raidData.name} - Edit`;

  const description = `Edit raid details for ${raidData.name}${raidData.zone ? ` in ${raidData.zone}` : ""}${raidData.date ? ` on ${new Date(raidData.date).toLocaleDateString()}` : ""}`;

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
  };
}

async function RaidEditPageContent({
  raidId,
  session,
}: {
  raidId: number;
  session: Session | null;
}) {
  if (!session?.user?.isRaidManager) {
    redirect("/raids");
  }

  // Fetch raid data using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const raidData = await caller.raid.getRaidById(raidId);

  if (!raidData) {
    redirect("/raids");
  }

  // Get raid name for breadcrumb from the fetched data
  const raidName = raidData.name;

  return (
    <RaidEditPageWrapper
      raidId={raidId}
      raidData={raidData}
      initialBreadcrumbData={raidName ? { [raidId.toString()]: raidName } : {}}
    />
  );
}

export default async function RaidEditPage({
  params,
}: {
  params: Promise<{ raidId: number }>;
}) {
  const p = await params;
  const raidId = parseInt(String(p.raidId));
  const session = await auth();

  return (
    <Suspense fallback={<RaidEditSkeleton />}>
      <RaidEditPageContent raidId={raidId} session={session} />
    </Suspense>
  );
}
