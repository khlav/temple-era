import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans, raidPlanCharacters, characters } from "~/server/db/schema";
import { and, eq } from "drizzle-orm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PatchRosterSlotSchema = z.object({
  characterId: z.number().int(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; planCharacterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, planCharacterId } = await params;

    if (!UUID_RE.test(id) || !UUID_RE.test(planCharacterId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchRosterSlotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { characterId } = parsed.data;

    // Verify plan exists
    const plan = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Verify planCharacterId belongs to this plan
    const slot = await db
      .select({ id: raidPlanCharacters.id })
      .from(raidPlanCharacters)
      .where(
        and(
          eq(raidPlanCharacters.id, planCharacterId),
          eq(raidPlanCharacters.raidPlanId, id),
        ),
      )
      .limit(1);

    if (slot.length === 0) {
      return NextResponse.json(
        { error: "Roster slot not found" },
        { status: 404 },
      );
    }

    // Verify characterId exists in the characters table
    const character = await db
      .select({ characterId: characters.characterId, name: characters.name })
      .from(characters)
      .where(eq(characters.characterId, characterId))
      .limit(1);

    if (character.length === 0) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 400 },
      );
    }

    await db
      .update(raidPlanCharacters)
      .set({
        characterId: character[0]!.characterId,
        characterName: character[0]!.name,
      })
      .where(eq(raidPlanCharacters.id, planCharacterId));

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
