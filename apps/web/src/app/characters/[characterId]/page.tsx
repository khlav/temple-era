import { CharacterPageWrapper } from "~/components/characters/character-page-wrapper";
import { auth } from "~/server/auth";
import {
  getCharacterMetadataWithStats,
  getCharacterBreadcrumbName,
  generateCharacterMetadata,
} from "~/server/metadata-helpers";
import { type Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ characterId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const characterId = parseInt(String(p.characterId));
  const characterData = await getCharacterMetadataWithStats(characterId);

  const metadata = generateCharacterMetadata(characterData, characterId);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: metadata.openGraph,
    other: {
      "application/ld+json": JSON.stringify(metadata.structuredData),
    },
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

  // Get character name for breadcrumb
  const characterName = await getCharacterBreadcrumbName(characterId);

  return (
    <CharacterPageWrapper
      characterId={characterId}
      showEditButton={session?.user?.isRaidManager}
      showRecipeEdit={!!session?.user}
      initialBreadcrumbData={
        characterName ? { [characterId.toString()]: characterName } : {}
      }
    />
  );
}
