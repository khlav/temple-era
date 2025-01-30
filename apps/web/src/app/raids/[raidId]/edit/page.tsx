import {auth} from "~/server/auth";
import {EditRaid} from "~/components/raids/edit-raid";
import {redirect} from "next/navigation";

export default async function RaidEditPage({params} : {params: Promise<{ raidId: number }> }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])
  const session = await auth();

  if(!session?.user?.isRaidManager) {
    redirect('/raids');
  }

  return (
    <div>
      <EditRaid raidId={raidId} />
    </div>
  );
}
