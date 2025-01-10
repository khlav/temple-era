import {RaidInfo} from "~/components/raids/old/raid-info";
import {RaidDetail} from "~/components/raids/raid-detail";
import {auth} from "~/server/auth";
import {redirect} from "next/navigation";

export default async function RaidPage({params} : {params: Promise<{ raidId: number }> }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])
  const session = await auth();

  return (
    <div>
      <RaidDetail raidId={raidId} showEditButton={session?.user?.isAdmin}/>
      {/*<RaidInfo raidId={raidId} />*/}
    </div>
  );
}
