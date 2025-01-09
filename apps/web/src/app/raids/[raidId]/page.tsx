import {RaidInfo} from "~/components/raids/old/raid-info";
import {RaidDetail} from "~/components/raids/raid-detail";

export default async function RaidPage({params} : {params: { raidId: number } }) {
  const p = await params;
  const raidId = parseInt(String(p.raidId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])

  return (
    <div>
      <RaidDetail raidId={raidId} />
      <RaidInfo raidId={raidId} />

    </div>
  );
}
