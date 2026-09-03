import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";

// Trailing segment(s) that mean "resolve to this toon's main" rather than the toon
// itself, e.g. /c/Daisy/main or /characters/Daisy/1 for an alt named Daisy.
const PRIMARY_ALIASES = new Set(["1", "main", "primary"]);

export function isPrimaryAlias(segment: string | undefined): boolean {
  return !!segment && PRIMARY_ALIASES.has(segment.toLowerCase());
}

/**
 * The vanity slug appended after a character ID in canonical URLs
 * (`/characters/<id>/<slug>`) — the character's real name with diacritics stripped
 * (case preserved) so the URL stays readable without requiring exact accents.
 */
export function canonicalCharacterSlug(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Diacritic- and case-insensitive exact name match, shared by the `/c/<name>` shortlink
 * and the `/characters/<name>` fallback — uses the same f_unaccent() Postgres function
 * as the `/api/v1/characters/by-name` API, so "daisy" resolves whichever accented form
 * is actually on the roster.
 */
export async function findCharactersByName(name: string) {
  return db
    .select({
      characterId: characters.characterId,
      name: characters.name,
      primaryCharacterId: characters.primaryCharacterId,
    })
    .from(characters)
    .where(
      and(
        eq(characters.isIgnored, false),
        sql`public.f_unaccent(lower(${characters.name})) = public.f_unaccent(lower(${name}))`,
      ),
    );
}

/**
 * Name + primary link for a known character ID — used to build the canonical
 * `/characters/<id>/<slug>` URL and to resolve the `/1`, `/main`, `/primary` redirect.
 * Null means the ID doesn't exist.
 */
export async function getCharacterRouteInfo(
  characterId: number,
): Promise<{ name: string; primaryCharacterId: number | null } | null> {
  const result = await db
    .select({ name: characters.name, primaryCharacterId: characters.primaryCharacterId })
    .from(characters)
    .where(eq(characters.characterId, characterId))
    .limit(1);

  return result[0] ?? null;
}
