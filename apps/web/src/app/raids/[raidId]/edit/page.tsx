import { auth } from "~/server/auth";
import { RaidEditPageWrapper } from "~/components/raids/raid-edit-page-wrapper";
import { redirect } from "next/navigation";
import {
  getRaidMetadataWithStats,
  getRaidBreadcrumbName,
} from "~/server/metadata-helpers";
import { type Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ raidId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const raidId = parseInt(String(p.raidId));
  const raidData = await getRaidMetadataWithStats(raidId);

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
    },
  };
}

export default async function RaidEditPage({
  params,
}: {
  params: Promise<{ raidId: number }>;
}) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])
  const session = await auth();

  if (!session?.user?.isRaidManager) {
    redirect("/raids");
  }

  // Get raid name for breadcrumb
  const raidName = await getRaidBreadcrumbName(raidId);

  return (
    <RaidEditPageWrapper
      raidId={raidId}
      initialBreadcrumbData={raidName ? { [raidId.toString()]: raidName } : {}}
    />
  );
}
