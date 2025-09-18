import { auth } from "~/server/auth";
import { RaidEditPageWrapper } from "~/components/raids/raid-edit-page-wrapper";
import { redirect } from "next/navigation";
import { getRaidMetadata } from "~/server/metadata-helpers";
import { type Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ raidId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const raidId = parseInt(String(p.raidId));
  const raidData = await getRaidMetadata(raidId);

  const title = raidData?.name
    ? `Temple Raid Attendance - Raids - ${raidData.name} - Edit`
    : `Temple Raid Attendance - Raids - ${raidId} - Edit`;

  const description = raidData?.name
    ? `Edit raid details for ${raidData.name}${raidData.zone ? ` in ${raidData.zone}` : ""}`
    : `Edit raid details for raid ${raidId}`;

  return {
    title,
    description,
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

  return <RaidEditPageWrapper raidId={raidId} />;
}
