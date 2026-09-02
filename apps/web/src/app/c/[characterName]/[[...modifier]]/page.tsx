import { redirect } from "next/navigation";
import {
  canonicalCharacterSlug,
  findCharactersByName,
  getCharacterRouteInfo,
  isPrimaryAlias,
} from "~/server/services/character-name-lookup";

// Short, shareable link: /c/<name> jumps straight to a character's page. Matching is
// diacritic- and case-insensitive (via the same f_unaccent() Postgres function the
// by-name API uses) so "daisy" resolves whichever accented form is actually on the
// roster — the visitor shouldn't have to know or type the exact diacritics.
//
// An optional trailing segment — /c/<name>/1, /c/<name>/main, /c/<name>/primary — redirects
// to that toon's main instead of the toon itself. Any other trailing segment is ignored
// (treated the same as no segment) rather than 404ing.

function canonicalCharacterPath(characterId: number, name: string): string {
  return `/characters/${characterId}/${encodeURIComponent(canonicalCharacterSlug(name))}`;
}

export default async function CharacterShortlinkPage({
  params,
}: {
  params: Promise<{ characterName: string; modifier?: string[] }>;
}) {
  const { characterName, modifier } = await params;
  // Next does not decode dynamic segments before handing them to the page — a
  // percent-encoded accent (e.g. %C3%A1 for "á") arrives here still encoded.
  let decoded = characterName;
  try {
    decoded = decodeURIComponent(characterName);
  } catch {
    // Malformed percent-encoding — fall back to the raw segment rather than 500ing.
  }
  const name = decoded.trim();

  if (!name) {
    redirect("/characters");
  }

  const wantsPrimary = isPrimaryAlias(modifier?.[0]);

  const matches = await findCharactersByName(name);

  const onlyMatch = matches.length === 1 ? matches[0] : undefined;
  if (onlyMatch) {
    // A null primaryCharacterId means this character IS the primary (or an unlinked
    // secondary) — redirect to itself rather than to a nonexistent "primary".
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
