import {RaidDetail} from "~/app/ui/raids/raiddetail";
import BackButton from "~/app/ui/nav/backbutton";

export default async function RaidPage({params} : {params: { raidId: number } }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])

  return (
    <div>
      <div className="mb-4"> <BackButton label="Back"/></div>
      <RaidDetail raidId={raidId} />
    </div>
  );
}
