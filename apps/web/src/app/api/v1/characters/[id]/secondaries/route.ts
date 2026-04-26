import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";

const BodySchema = z.object({
  secondaryIds: z.array(z.number().int()).min(1),
  mode: z.enum(["replace", "append"]).default("replace"),
});

export async function PUT(
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
    const primaryId = parseInt(id, 10);
    if (isNaN(primaryId)) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { secondaryIds, mode } = parsed.data;

    if (secondaryIds.includes(primaryId)) {
      return NextResponse.json(
        { error: "secondaryIds must not include the primary character ID" },
        { status: 400 },
      );
    }

    const primary = await db.query.characters.findFirst({
      where: eq(characters.characterId, primaryId),
      columns: { characterId: true, isPrimary: true },
    });

    if (!primary) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    if (!primary.isPrimary) {
      return NextResponse.json(
        {
          error:
            "Character is not a primary (it may be a secondary of another character)",
        },
        { status: 400 },
      );
    }

    let finalSecondaryIds = secondaryIds;

    if (mode === "append") {
      const current = await db
        .select({ characterId: characters.characterId })
        .from(characters)
        .where(eq(characters.primaryCharacterId, primaryId));
      const existingIds = current.map((c) => c.characterId);
      finalSecondaryIds = [...new Set([...existingIds, ...secondaryIds])];
    }

    // Two-step replace wrapped in transaction: clear existing, set new
    await db.transaction(async (tx) => {
      await tx
        .update(characters)
        .set({ primaryCharacterId: null })
        .where(eq(characters.primaryCharacterId, primaryId));

      await tx
        .update(characters)
        .set({ primaryCharacterId: primaryId })
        .where(inArray(characters.characterId, finalSecondaryIds));
    });

    const updated = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
      })
      .from(characters)
      .where(eq(characters.primaryCharacterId, primaryId));

    return NextResponse.json({
      primaryCharacterId: primaryId,
      secondaryCharacters: updated,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
