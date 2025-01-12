import {CharacterDetail} from "~/components/players/character-detail";

export default async function PlayerPage({ params }: {params: Promise<{characterId: number}>}) {
  const p = await params;
  const characterId = parseInt(String(p.characterId));
  return (
    <div className="w-full px-4">
      {characterId && (
        <>
          <CharacterDetail characterId={characterId} />
        </>
      )}
    </div>
  );
}
