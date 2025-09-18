import { RaidPageWrapper } from "~/components/raids/raid-page-wrapper";
import { auth } from "~/server/auth";
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
    ? `Temple Raid Attendance - Raids - ${raidData.name}`
    : `Temple Raid Attendance - Raids - ${raidId}`;

  const description = raidData?.name
    ? `Raid details for ${raidData.name}${raidData.zone ? ` in ${raidData.zone}` : ""}`
    : `Raid details for raid ${raidId}`;

  return {
    title,
    description,
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

  return (
    <RaidPageWrapper
      raidId={raidId}
      showEditButton={session?.user?.isRaidManager}
    />
  );
}
