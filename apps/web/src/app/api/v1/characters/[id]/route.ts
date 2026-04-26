import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const characterId = parseInt(id, 10);
    if (isNaN(characterId)) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 },
      );
    }

    const characterResult = await db.query.characters.findFirst({
      where: eq(characters.characterId, characterId),
      columns: {
        characterId: true,
        name: true,
        class: true,
        classDetail: true,
        server: true,
        slug: true,
        isPrimary: true,
        primaryCharacterId: true,
        isIgnored: true,
      },
      with: {
        primaryCharacter: {
          columns: { name: true },
        },
        secondaryCharacters: {
          columns: {
            characterId: true,
            name: true,
            class: true,
            classDetail: true,
            server: true,
            slug: true,
          },
        },
      },
    });

    if (!characterResult) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      characterId: characterResult.characterId,
      name: characterResult.name,
      class: characterResult.class,
      classDetail: characterResult.classDetail,
      server: characterResult.server,
      slug: characterResult.slug,
      isPrimary: characterResult.isPrimary,
      primaryCharacterId: characterResult.primaryCharacterId,
      primaryCharacterName: characterResult.primaryCharacter?.name ?? null,
      isIgnored: characterResult.isIgnored,
      secondaryCharacters: characterResult.secondaryCharacters,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
