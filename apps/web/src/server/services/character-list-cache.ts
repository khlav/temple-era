import { unstable_cache } from "next/cache";
import { aliasedTable, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";

// 24h fallback only. Freshness comes from the cache key: `version` (see getCharacterListVersion)
// moves on any insert, delete or Drizzle update of `character`, so a change lands on a new key
// instead of needing a revalidateTag call at every write site — the same approach as the raid
// plan cache (raid-plan-content.ts).
const REVALIDATE_SECONDS = 60 * 60 * 24;

export type CharacterListFilter = "all" | "primary" | "secondary" | "secondaryEligible";

/**
 * Row count plus latest created/updated time of `character` — one row back, against ~1,500 rows
 * for the list itself. Inserts and deletes move the count; updates move max(updated_at), which
 * Drizzle's $onUpdate sets on every `.update(characters)` (there are no raw-SQL updates of this
 * table). Returned as text so it is stable as a cache key.
 */
async function getCharacterListVersion(): Promise<string> {
  const [row] = await db
    .select({
      version: sql<string>`count(*)::text || ':' || coalesce(max(coalesce(${characters.updatedAt}, ${characters.createdAt})), 'epoch')::text`,
    })
    .from(characters);
  return row?.version ?? "0";
}

/** WHERE clause for the filters other than "secondaryEligible", which has its own query. */
export function characterFilterPredicate(filter: CharacterListFilter) {
  switch (filter) {
    case "primary":
      return eq(characters.isPrimary, true);
    case "secondary":
      return eq(characters.isPrimary, false);
    default:
      return inArray(characters.isPrimary, [true, false]); // get all
  }
}

async function loadCharacterList(filter: CharacterListFilter) {
  const primaryCharacters = aliasedTable(characters, "primary_character");
  const columns = {
    name: characters.name,
    server: characters.server,
    slug: characters.slug,
    class: characters.class,
    characterId: characters.characterId,
    isPrimary: characters.isPrimary,
    primaryCharacterId: characters.primaryCharacterId,
    primaryCharacterName: primaryCharacters.name,
  };

  if (filter === "secondaryEligible") {
    // Assignable only -- e.g. only Secondary characters OR primary characters with no secondaries
    const countSecondary = db.$with("countSecondary").as(
      db
        .select({
          primaryCharacterId: characters.primaryCharacterId,
          countSecondaryCharacters: count(characters.characterId).as("countSecondaryCharacters"),
        })
        .from(characters)
        .groupBy(characters.primaryCharacterId),
    );

    return db
      .with(countSecondary)
      .select(columns)
      .from(characters)
      .leftJoin(primaryCharacters, eq(characters.primaryCharacterId, primaryCharacters.characterId))
      .leftJoin(countSecondary, eq(countSecondary.primaryCharacterId, characters.characterId))
      .where(
        or(
          eq(countSecondary.countSecondaryCharacters, 0),
          isNull(countSecondary.countSecondaryCharacters),
        ),
      );
  }

  return db
    .select(columns)
    .from(characters)
    .leftJoin(primaryCharacters, eq(characters.primaryCharacterId, primaryCharacters.characterId))
    .where(characterFilterPredicate(filter));
}

const getCachedCharacterList = unstable_cache(
  // `version` is unused in the body: it's here so it becomes part of the cache key.
  async (filter: CharacterListFilter, _version: string) => loadCharacterList(filter),
  ["character-list"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * The character list behind character.getCharacters — the same for every viewer, ~1,500 rows,
 * and loaded by the characters page and every raid planner viewer's groups grid. It was uncached
 * and the second-largest query by rows on prod (TEMPLE-151). Shared across serverless instances
 * via Vercel's Data Cache.
 */
export async function getCharacterList(filter: CharacterListFilter) {
  return getCachedCharacterList(filter, await getCharacterListVersion());
}
