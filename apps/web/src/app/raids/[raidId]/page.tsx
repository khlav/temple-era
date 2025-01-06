import {RaidInfo} from "~/components/raids/raid-info";
import BackButton from "~/components/nav/old/back-button";

export default async function RaidPage({params} : {params: { raidId: number } }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])

  return (
    <div>
      <div className="mb-4"> <BackButton label="Back"/></div>
      <RaidInfo raidId={raidId} />
    </div>
  );
}
