import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { user } = authResult;
    if (!user.isRaidManager && !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const characterId = parseInt(id, 10);
    if (isNaN(characterId)) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 },
      );
    }

    const char = await db.query.characters.findFirst({
      where: eq(characters.characterId, characterId),
      columns: { characterId: true, name: true, primaryCharacterId: true },
    });

    if (!char) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    if (
      char.primaryCharacterId === null ||
      char.primaryCharacterId === char.characterId
    ) {
      return NextResponse.json(
        { error: "Character is not a secondary (has no primary to unlink)" },
        { status: 400 },
      );
    }

    await db
      .update(characters)
      .set({ primaryCharacterId: null })
      .where(eq(characters.characterId, characterId));

    return NextResponse.json({
      characterId: char.characterId,
      name: char.name,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
