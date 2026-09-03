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
import { redirect } from "next/navigation";
import {
  canonicalCharacterSlug,
  findCharactersByName,
  getCharacterRouteInfo,
  isPrimaryAlias,
} from "~/server/services/character-name-lookup";

const NUMERIC_ID_PATTERN = /^\d+$/;

function canonicalCharacterPath(characterId: number, name: string): string {
  return `/characters/${characterId}/${encodeURIComponent(canonicalCharacterSlug(name))}`;
}

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

  // getCharacterById always returns an object (spreading a possibly-undefined query result), so
  // a plain truthiness check never catches "not found" — check the PK it would have carried
  // instead. Redirect rather than showing an inline message: a stale link or hand-edited URL
  // should land the user back on a real page, not a dead end.
  if (!characterData.characterId) {
    redirect("/characters");
  }

  // Get character name for breadcrumb from the fetched data
  const characterName = characterData.name;

  return (
    <CharacterPageWrapper
      characterId={characterId}
      characterData={characterData}
      showEditButton={session?.user?.isRaidManager}
      showRecipeEdit={!!session?.user}
      initialBreadcrumbData={characterName ? { [characterId.toString()]: characterName } : {}}
    />
  );
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ characterId: number; modifier?: string[] }>;
}) {
  const p = await params;
  const session = await auth();
  const raw = String(p.characterId);
  // Next does not decode dynamic segments — a canonical slug redirect target is built
  // from a plain (unencoded) name, so the incoming segment must be decoded before any
  // comparison against it, or a name requiring encoding would never match its own
  // canonical form and loop.
  let decodedModifier = p.modifier?.[0];
  try {
    decodedModifier =
      decodedModifier === undefined ? undefined : decodeURIComponent(decodedModifier);
  } catch {
    // Malformed percent-encoding — fall back to the raw segment rather than 500ing.
  }
  const wantsPrimary = isPrimaryAlias(decodedModifier);

  if (!NUMERIC_ID_PATTERN.test(raw)) {
    // Not a numeric ID — treat the segment as a character name, same as the /c/<name>
    // shortlink: diacritic/case-insensitive exact match, single hit goes straight to
    // the character (or its main, for the same /1, /main, /primary trailing segment),
    // anything else (zero or multiple) falls back to a prepopulated search.
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // Malformed percent-encoding — fall back to the raw segment rather than 500ing.
    }
    const name = decoded.trim();

    if (!name) {
      redirect("/characters");
    }

    const matches = await findCharactersByName(name);
    const onlyMatch = matches.length === 1 ? matches[0] : undefined;
    if (onlyMatch) {
      if (wantsPrimary && onlyMatch.primaryCharacterId) {
        const primaryInfo = await getCharacterRouteInfo(onlyMatch.primaryCharacterId);
        if (primaryInfo) {
          redirect(canonicalCharacterPath(onlyMatch.primaryCharacterId, primaryInfo.name));
        }
      }
      redirect(canonicalCharacterPath(onlyMatch.characterId, onlyMatch.name));
    }

    redirect(`/characters?q=${encodeURIComponent(name)}`);
  }

  const characterId = parseInt(raw);
  const info = await getCharacterRouteInfo(characterId);

  // Not found — short-circuit rather than rendering a page for an ID that doesn't exist.
  if (!info) {
    redirect("/characters");
  }

  if (wantsPrimary && info.primaryCharacterId && info.primaryCharacterId !== characterId) {
    const primaryInfo = await getCharacterRouteInfo(info.primaryCharacterId);
    if (primaryInfo) {
      redirect(canonicalCharacterPath(info.primaryCharacterId, primaryInfo.name));
    }
  }

  // Canonical URL is always /characters/<id>/<name-without-diacritics> — a missing,
  // stale (renamed character), or hand-typed trailing segment gets corrected here rather
  // than just accepted, so every link to a given ID converges on the same URL.
  const canonicalSlug = canonicalCharacterSlug(info.name);
  if (decodedModifier !== canonicalSlug) {
    redirect(canonicalCharacterPath(characterId, info.name));
  }

  return (
    <Suspense fallback={<CharacterDetailSkeleton />}>
      <CharacterPageContent characterId={characterId} session={session} />
    </Suspense>
  );
}
