import { RaidPageWrapper } from "~/components/raids/raid-page-wrapper";
import { auth } from "~/server/auth";
import {
  getRaidMetadataWithStats,
  getRaidBreadcrumbName,
  generateRaidMetadata,
} from "~/server/metadata-helpers";
import { type Metadata } from "next";
// import { MetadataDebug } from "~/components/debug/metadata-debug"; // Uncomment to enable debug

export async function generateMetadata({
  params,
}: {
  params: Promise<{ raidId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const raidId = parseInt(String(p.raidId));
  const raidData = await getRaidMetadataWithStats(raidId);

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

export default async function RaidPage({
  params,
}: {
  params: Promise<{ raidId: number }>;
}) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])
  const session = await auth();

  // Get raid name for breadcrumb
  const raidName = await getRaidBreadcrumbName(raidId);

  return (
    <>
      <RaidPageWrapper
        raidId={raidId}
        showEditButton={session?.user?.isRaidManager}
        initialBreadcrumbData={
          raidName ? { [raidId.toString()]: raidName } : {}
        }
      />
      {/* <MetadataDebug raidId={raidId} /> Uncomment to enable debug */}
    </>
  );
}
