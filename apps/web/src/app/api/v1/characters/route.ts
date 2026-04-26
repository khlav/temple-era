import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";
import { eq, and, not, ilike, aliasedTable, type SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const type = searchParams.get("type") ?? "all";

    const primaryCharacters = aliasedTable(characters, "primary_character");

    const whereConditions: SQL[] = [];

    if (q) {
      whereConditions.push(ilike(characters.name, `%${q}%`));
    }

    if (type === "primary") {
      whereConditions.push(eq(characters.isPrimary, true));
    } else if (type === "secondary") {
      whereConditions.push(not(eq(characters.isPrimary, true)));
    }

    // Always exclude ignored characters
    whereConditions.push(eq(characters.isIgnored, false));

    const result = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        classDetail: characters.classDetail,
        server: characters.server,
        slug: characters.slug,
        isPrimary: characters.isPrimary,
        primaryCharacterId: characters.primaryCharacterId,
        primaryCharacterName: primaryCharacters.name,
      })
      .from(characters)
      .leftJoin(
        primaryCharacters,
        eq(characters.primaryCharacterId, primaryCharacters.characterId),
      )
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(characters.name)
      .limit(200);

    return NextResponse.json(result);
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
