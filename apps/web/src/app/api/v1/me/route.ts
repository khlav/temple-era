import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    const character = user.characterId
      ? await db.query.characters.findFirst({
          where: eq(characters.characterId, user.characterId),
          columns: {
            characterId: true,
            name: true,
            class: true,
            primaryCharacterId: true,
            slug: true,
            classDetail: true,
          },
        })
      : null;

    return NextResponse.json({
      id: user.id,
      name: user.name,
      image: user.image,
      isRaidManager: user.isRaidManager,
      isAdmin: user.isAdmin,
      character: character ?? null,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
