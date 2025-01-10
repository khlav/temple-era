import {RaidInfo} from "~/components/raids/old/raid-info";
import {RaidDetail} from "~/components/raids/raid-detail";
import {auth} from "~/server/auth";
import {EditRaid} from "~/components/raids/edit-raid";
// import {EditRaid} from "~/components/raids/edit-raid";

export default async function RaidEditPage({params} : {params: { raidId: number } }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])
  const session = await auth();

  return (
    <div>
      <EditRaid raidId={raidId} />
    </div>
  );
}
