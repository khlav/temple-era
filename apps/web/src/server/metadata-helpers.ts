import { db } from "~/server/db";
import { raids, characters } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function getRaidMetadata(raidId: number) {
  try {
    const raidResult = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        date: raids.date,
        zone: raids.zone,
      })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    return raidResult[0] || null;
  } catch (error) {
    console.error("Error fetching raid metadata:", error);
    return null;
  }
}

export async function getCharacterMetadata(characterId: number) {
  try {
    const characterResult = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
      })
      .from(characters)
      .where(eq(characters.characterId, characterId))
      .limit(1);

    return characterResult[0] || null;
  } catch (error) {
    console.error("Error fetching character metadata:", error);
    return null;
  }
}

// Breadcrumb-specific helpers that return just the name for breadcrumb display
export async function getRaidBreadcrumbName(
  raidId: number,
): Promise<string | null> {
  try {
    const raidResult = await db
      .select({
        name: raids.name,
      })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    return raidResult[0]?.name || null;
  } catch (error) {
    console.error("Error fetching raid breadcrumb name:", error);
    return null;
  }
}

export async function getCharacterBreadcrumbName(
  characterId: number,
): Promise<string | null> {
  try {
    const characterResult = await db
      .select({
        name: characters.name,
      })
      .from(characters)
      .where(eq(characters.characterId, characterId))
      .limit(1);

    return characterResult[0]?.name || null;
  } catch (error) {
    console.error("Error fetching character breadcrumb name:", error);
    return null;
  }
}
