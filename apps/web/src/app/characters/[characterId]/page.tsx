import { CharacterPageWrapper } from "~/components/characters/character-page-wrapper";
import { auth } from "~/server/auth";
import { getCharacterMetadata } from "~/server/metadata-helpers";
import { type Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ characterId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const characterId = parseInt(String(p.characterId));
  const characterData = await getCharacterMetadata(characterId);

  const title = characterData?.name
    ? `Temple Raid Attendance - Characters - ${characterData.name}`
    : `Temple Raid Attendance - Characters - ${characterId}`;

  const description = characterData?.name
    ? `Character details for ${characterData.name}${characterData.class ? ` (${characterData.class})` : ""}${characterData.server ? ` on ${characterData.server}` : ""}`
    : `Character details for character ${characterId}`;

  return {
    title,
    description,
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ characterId: number }>;
}) {
  const p = await params;
  const session = await auth();
  const characterId = parseInt(String(p.characterId));
  return (
    <CharacterPageWrapper
      characterId={characterId}
      showEditButton={session?.user?.isRaidManager}
      showRecipeEdit={!!session?.user}
    />
  );
}
