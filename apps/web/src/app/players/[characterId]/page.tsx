import {CharacterDetail, CharacterRaids} from "~/components/players/old/characterdetail";

export default async function PlayerPage({params} : {params: { characterId: number } }) {
  const p = await params;
  const characterId = parseInt(String(p.characterId)); // Access your dynamic URL parameter here (e.g., /raids/[[raidId]])

  return (
    <div>
      <div className="text-2xl">Character pages are in-progress.  Meanwhile, here's some raw data.</div>
      <div className="text-muted-foreground pb-4">Character ID: {characterId}</div>
      <CharacterDetail characterId={characterId} />
      <CharacterRaids characterId={characterId} />
    </div>
  );
}
