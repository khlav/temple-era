import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApiToken } from "~/server/api/v1-auth";
import {
  matchSignupsToCharacters,
  resolveClassName,
} from "~/server/api/helpers/match-signups";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
} from "~/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SyncSignupsSchema = z.object({
  mode: z
    .enum(["addNewSignupsToBench", "fullReimport"])
    .default("addNewSignupsToBench"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    let body: unknown = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = SyncSignupsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { mode } = parsed.data;

    // 1. Fetch plan to get raidHelperEventId
    const plan = await db
      .select({
        id: raidPlans.id,
        raidHelperEventId: raidPlans.raidHelperEventId,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const { raidHelperEventId } = plan[0]!;

    if (!raidHelperEventId) {
      return NextResponse.json(
        { error: "Plan has no linked Raid Helper event" },
        { status: 400 },
      );
    }

    // 2. Fetch event from Raid Helper, resolve lastEventId if needed
    const initialResponse = await fetch(
      `${RAID_HELPER_API_BASE}/v4/events/${raidHelperEventId}`,
      { headers: { Authorization: env.RAID_HELPER_API_KEY } },
    );

    if (!initialResponse.ok) {
      return NextResponse.json(
        { error: "Raid Helper API unavailable" },
        { status: 502 },
      );
    }

    const initialData = (await initialResponse.json()) as Record<
      string,
      unknown
    >;

    // Recurring/scheduled events use lastEventId — resolve to the actual instance
    const actualEventId =
      !initialData.signUps && initialData.lastEventId
        ? (initialData.lastEventId as string)
        : raidHelperEventId;

    let eventData: { signUps?: unknown[] } & Record<string, unknown>;
    if (actualEventId !== raidHelperEventId) {
      const resolvedResponse = await fetch(
        `${RAID_HELPER_API_BASE}/v4/events/${actualEventId}`,
        { headers: { Authorization: env.RAID_HELPER_API_KEY } },
      );
      if (!resolvedResponse.ok) {
        return NextResponse.json(
          { error: "Raid Helper API unavailable" },
          { status: 502 },
        );
      }
      eventData = (await resolvedResponse.json()) as typeof eventData;
    } else {
      eventData = initialData as typeof eventData;
    }

    // 3. Filter and reconcile signups → characters
    const rawSignups = (eventData.signUps ?? []) as Array<{
      userId: string;
      name: string;
      className: string;
      specName?: string;
      position: number;
    }>;

    const filteredSignups = rawSignups
      .filter((s) => resolveClassName(s.className, s.specName) !== null)
      .map((s) => ({
        userId: s.userId,
        discordName: s.name,
        className: s.className,
        specName: s.specName,
      }));

    const matchResults = await matchSignupsToCharacters(db, filteredSignups);

    // Convert match results to the shape refreshCharacters expects
    const characters = matchResults
      .filter((r) => r.status !== "skipped")
      .map((r) => ({
        characterId: r.matchedCharacter?.characterId ?? null,
        characterName: r.matchedCharacter?.characterName ?? r.discordName,
        defaultGroup: null as number | null,
        defaultPosition: null as number | null,
        writeInClass: r.matchedCharacter
          ? null
          : (resolveClassName(r.className, r.specName) ?? null),
      }));

    // 4. Execute refresh transaction (same logic as refreshCharacters tRPC procedure)
    const existing = await db
      .select({
        id: raidPlanCharacters.id,
        characterId: raidPlanCharacters.characterId,
        characterName: raidPlanCharacters.characterName,
      })
      .from(raidPlanCharacters)
      .where(eq(raidPlanCharacters.raidPlanId, id));

    const matchedExistingIds = new Set<string>();
    const matchedNewIndices = new Set<number>();
    const matches = new Map<
      number,
      { id: string; characterId: number | null; characterName: string }
    >();

    // Pass 1: match by characterId
    for (let i = 0; i < characters.length; i++) {
      const newChar = characters[i]!;
      if (newChar.characterId === null) continue;
      const match = existing.find(
        (e) =>
          !matchedExistingIds.has(e.id) &&
          e.characterId === newChar.characterId,
      );
      if (match) {
        matchedExistingIds.add(match.id);
        matchedNewIndices.add(i);
        matches.set(i, match);
      }
    }

    // Pass 2: match by characterName (case-insensitive)
    for (let i = 0; i < characters.length; i++) {
      if (matchedNewIndices.has(i)) continue;
      const newChar = characters[i]!;
      const match = existing.find(
        (e) =>
          !matchedExistingIds.has(e.id) &&
          e.characterName.toLowerCase() === newChar.characterName.toLowerCase(),
      );
      if (match) {
        matchedExistingIds.add(match.id);
        matchedNewIndices.add(i);
        matches.set(i, match);
      }
    }

    const toInsert = characters.filter((_, i) => !matchedNewIndices.has(i));
    const isMergeOnly = mode === "addNewSignupsToBench";
    const toDelete = isMergeOnly
      ? []
      : existing.filter((e) => !matchedExistingIds.has(e.id)).map((e) => e.id);
    const charactersToUpdate = isMergeOnly ? new Map() : matches;

    await db.transaction(async (tx) => {
      for (const [newIndex, existingRecord] of charactersToUpdate) {
        const newChar = characters[newIndex]!;
        await tx
          .update(raidPlanCharacters)
          .set({
            characterId: newChar.characterId,
            characterName: newChar.characterName,
            defaultGroup: newChar.defaultGroup,
            defaultPosition: newChar.defaultPosition,
            writeInClass: newChar.characterId
              ? null
              : (newChar.writeInClass ?? null),
          })
          .where(eq(raidPlanCharacters.id, existingRecord.id));
      }

      if (toInsert.length > 0) {
        await tx.insert(raidPlanCharacters).values(
          toInsert.map((char) => ({
            raidPlanId: id,
            characterId: char.characterId,
            characterName: char.characterName,
            defaultGroup: isMergeOnly ? null : char.defaultGroup,
            defaultPosition: isMergeOnly ? null : char.defaultPosition,
            writeInClass: char.characterId ? null : (char.writeInClass ?? null),
          })),
        );
      }

      if (toDelete.length > 0) {
        await tx
          .delete(raidPlanCharacters)
          .where(inArray(raidPlanCharacters.id, toDelete));
      }

      if (!isMergeOnly) {
        const customEncounters = await tx
          .select({ id: raidPlanEncounters.id })
          .from(raidPlanEncounters)
          .where(
            and(
              eq(raidPlanEncounters.raidPlanId, id),
              eq(raidPlanEncounters.useDefaultGroups, false),
            ),
          );

        if (customEncounters.length > 0) {
          const customEncounterIds = customEncounters.map((e) => e.id);
          await tx
            .delete(raidPlanEncounterAssignments)
            .where(
              inArray(
                raidPlanEncounterAssignments.encounterId,
                customEncounterIds,
              ),
            );
          await tx
            .update(raidPlanEncounters)
            .set({ useDefaultGroups: true })
            .where(inArray(raidPlanEncounters.id, customEncounterIds));
        }
      }
    });

    // Touch updatedById
    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({
      added: toInsert.length,
      updated: charactersToUpdate.size,
      removed: toDelete.length,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
