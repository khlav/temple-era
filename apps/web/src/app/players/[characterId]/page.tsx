import {
  CharacterDetail,
  CharacterRaids,
} from "~/components/players/old/characterdetail";

export default async function PlayerPage({ params }: {params: Promise<{characterId: number}>}) {
  const p = await params;
  const characterId = parseInt(String(p.characterId));
  return (
    <div>
      <div className="text-2xl">
        Character pages are in-progress. Meanwhile, here is a bit of data.
      </div>
      <div className="text-muted-foreground pb-4">
        Character ID: {characterId}
      </div>
      {characterId && (
        <>
          <CharacterDetail characterId={characterId} />
          <CharacterRaids characterId={characterId} />
        </>
      )}
    </div>
  );
}
