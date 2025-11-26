import { CharacterPageWrapper } from "~/components/characters/character-page-wrapper";
import { auth } from "~/server/auth";
import {
  getCharacterMetadataWithStats,
  generateCharacterMetadata,
} from "~/server/metadata-helpers";
import { type Metadata } from "next";
import { cache, Suspense } from "react";
import { CharacterDetailSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";

// Cache the character data fetch to avoid duplicate calls between generateMetadata and page component
const getCachedCharacterData = cache(async (characterId: number) => {
  return await getCharacterMetadataWithStats(characterId);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ characterId: number }>;
}): Promise<Metadata> {
  const p = await params;
  const characterId = parseInt(String(p.characterId));
  const characterData = await getCachedCharacterData(characterId);

  const metadata = generateCharacterMetadata(characterData, characterId);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: metadata.openGraph,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
    other: {
      "application/ld+json": JSON.stringify(metadata.structuredData),
    },
  };
}

async function CharacterPageContent({
  characterId,
  session,
}: {
  characterId: number;
  session: Session | null;
}) {
  // Fetch character data using tRPC
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);
  const characterData = await caller.character.getCharacterById(characterId);

  if (!characterData) {
    return <div>Character not found</div>;
  }

  // Get character name for breadcrumb from the fetched data
  const characterName = characterData.name;

  return (
    <CharacterPageWrapper
      characterId={characterId}
      characterData={characterData}
      showEditButton={session?.user?.isRaidManager}
      showRecipeEdit={!!session?.user}
      initialBreadcrumbData={
        characterName ? { [characterId.toString()]: characterName } : {}
      }
    />
  );
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
    <Suspense fallback={<CharacterDetailSkeleton />}>
      <CharacterPageContent characterId={characterId} session={session} />
    </Suspense>
  );
}
