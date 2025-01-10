import {RaidInfo} from "~/components/raids/old/raid-info";
import {RaidDetail} from "~/components/raids/raid-detail";
import {auth} from "~/server/auth";
import {EditRaid} from "~/components/raids/edit-raid";
import {redirect} from "next/navigation";
// import {EditRaid} from "~/components/raids/edit-raid";

export default async function RaidEditPage({params} : {params: Promise<{ raidId: number }> }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])
  const session = await auth();

  if(!session?.user?.isAdmin) {
    redirect('/');
  }

  return (
    <div>
      <EditRaid raidId={raidId} />
    </div>
  );
}
