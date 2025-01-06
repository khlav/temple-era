import BackButton from "~/components/nav/old/back-button";
import {CharacterDetail, CharacterRaids} from "~/components/players/characterdetail";

export default async function PlayersPage({params} : {params: { characterId: number } }) {
  const p = await params;
  const characterId = parseInt(String(p.characterId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])

  return (
    <div>
      <div className="mb-4"> <BackButton label="Back"/></div>
      <CharacterDetail characterId={characterId} />
      <CharacterRaids characterId={characterId} />
    </div>
  );
}
