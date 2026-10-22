import { unstable_cache } from "next/cache";
import { aliasedTable, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  characters,
  raidPlanCharacters,
  raidPlanEncounterAASlots,
  raidPlanEncounterAssignments,
  raidPlanEncounterGroups,
  raidPlanEncounterNotes,
  raidPlanEncounters,
  raidPlans,
  raids,
} from "~/server/db/schema";

// 24h fallback only. Freshness comes from the cache key: `version` is raid_plan.updated_at, which
// the touch triggers in drizzle/0001_custom_objects.sql (+ 0004 for notes) bump on any change to
// the plan's roster, groups, encounters, notes, assignments or AA slots. An edit therefore lands
// on a new key instead of needing a revalidateTag call at each of the router's mutation sites.
const REVALIDATE_SECONDS = 60 * 60 * 24;

/**
 * Everything a raid plan page renders that is the same for every viewer: the plan's AA template,
 * roster, encounters (+ notes), groups, assignments and AA slots. Personal layers — the viewer's
 * own characters, "view as" — are separate per-user queries on the client.
 *
 * Every value here must survive JSON, since unstable_cache stores it that way: no Date fields.
 *
 * Only data whose changes move the plan's version belongs here. The linked raid (name, date) is
 * edited independently of the plan, so getRaidPlanContent reads it live instead.
 */
async function loadRaidPlanContent(planId: string) {
  const primaryCharacters = aliasedTable(characters, "primary_characters");
  const [aaDefaults, planCharacters, encounters, encounterGroups] = await Promise.all([
    db
      .select({
        defaultAATemplate: raidPlans.defaultAATemplate,
        useDefaultAA: raidPlans.useDefaultAA,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, planId))
      .limit(1),
    db
      .select({
        id: raidPlanCharacters.id,
        characterId: raidPlanCharacters.characterId,
        // Resolve to effective primary: secondary.primaryCharacterId or primary's own characterId
        primaryCharacterId: sql<
          number | null
        >`COALESCE(${characters.primaryCharacterId}, ${characters.characterId})`,
        primaryCharacterName: primaryCharacters.name,
        characterName: raidPlanCharacters.characterName,
        defaultGroup: raidPlanCharacters.defaultGroup,
        defaultPosition: raidPlanCharacters.defaultPosition,
        // COALESCE: use joined character class, fall back to write-in class
        class: sql<
          string | null
        >`COALESCE(${characters.class}, ${raidPlanCharacters.writeInClass})`,
        server: characters.server,
      })
      .from(raidPlanCharacters)
      .leftJoin(characters, eq(raidPlanCharacters.characterId, characters.characterId))
      .leftJoin(
        primaryCharacters,
        eq(
          primaryCharacters.characterId,
          sql`COALESCE(${characters.primaryCharacterId}, ${characters.characterId})`,
        ),
      )
      .where(eq(raidPlanCharacters.raidPlanId, planId))
      .orderBy(
        raidPlanCharacters.defaultGroup,
        raidPlanCharacters.defaultPosition,
        raidPlanCharacters.characterName,
        raidPlanCharacters.id,
      ),
    db
      .select({
        id: raidPlanEncounters.id,
        encounterKey: raidPlanEncounters.encounterKey,
        encounterName: raidPlanEncounters.encounterName,
        sortOrder: raidPlanEncounters.sortOrder,
        groupId: raidPlanEncounters.groupId,
        useDefaultGroups: raidPlanEncounters.useDefaultGroups,
        aaTemplate: raidPlanEncounters.aaTemplate,
        useCustomAA: raidPlanEncounters.useCustomAA,
      })
      .from(raidPlanEncounters)
      .where(eq(raidPlanEncounters.raidPlanId, planId))
      .orderBy(raidPlanEncounters.sortOrder),
    db
      .select({
        id: raidPlanEncounterGroups.id,
        groupName: raidPlanEncounterGroups.groupName,
        sortOrder: raidPlanEncounterGroups.sortOrder,
      })
      .from(raidPlanEncounterGroups)
      .where(eq(raidPlanEncounterGroups.raidPlanId, planId))
      .orderBy(raidPlanEncounterGroups.sortOrder),
  ]);

  const encounterIds = encounters.map((e) => e.id);
  const customEncounterIds = encounters.filter((e) => !e.useDefaultGroups).map((e) => e.id);

  const aaSlotConditions = [eq(raidPlanEncounterAASlots.raidPlanId, planId)];
  if (encounterIds.length > 0) {
    aaSlotConditions.push(inArray(raidPlanEncounterAASlots.encounterId, encounterIds));
  }

  const [encounterNotes, encounterAssignments, aaSlotAssignments] = await Promise.all([
    encounterIds.length > 0
      ? db
          .select({
            id: raidPlanEncounterNotes.id,
            encounterId: raidPlanEncounterNotes.encounterId,
            iconRef: raidPlanEncounterNotes.iconRef,
            text: raidPlanEncounterNotes.text,
            sortOrder: raidPlanEncounterNotes.sortOrder,
          })
          .from(raidPlanEncounterNotes)
          .where(inArray(raidPlanEncounterNotes.encounterId, encounterIds))
          .orderBy(raidPlanEncounterNotes.encounterId, raidPlanEncounterNotes.sortOrder)
      : Promise.resolve([]),
    // Assignments only exist for encounters with custom groups
    customEncounterIds.length > 0
      ? db
          .select({
            encounterId: raidPlanEncounterAssignments.encounterId,
            planCharacterId: raidPlanEncounterAssignments.planCharacterId,
            groupNumber: raidPlanEncounterAssignments.groupNumber,
            position: raidPlanEncounterAssignments.position,
          })
          .from(raidPlanEncounterAssignments)
          .where(inArray(raidPlanEncounterAssignments.encounterId, customEncounterIds))
          .orderBy(
            raidPlanEncounterAssignments.encounterId,
            raidPlanEncounterAssignments.groupNumber,
            raidPlanEncounterAssignments.position,
            raidPlanEncounterAssignments.planCharacterId,
          )
      : Promise.resolve([]),
    // All AA slot assignments in one query (encounter-specific + default/trash)
    db
      .select({
        id: raidPlanEncounterAASlots.id,
        encounterId: raidPlanEncounterAASlots.encounterId,
        raidPlanId: raidPlanEncounterAASlots.raidPlanId,
        planCharacterId: raidPlanEncounterAASlots.planCharacterId,
        slotName: raidPlanEncounterAASlots.slotName,
        sortOrder: raidPlanEncounterAASlots.sortOrder,
      })
      .from(raidPlanEncounterAASlots)
      .where(or(...aaSlotConditions))
      .orderBy(raidPlanEncounterAASlots.sortOrder),
  ]);

  const notesByEncounterId = new Map<
    string,
    { id: string; iconRef: string; text: string | null; sortOrder: number }[]
  >();
  for (const note of encounterNotes) {
    const existing = notesByEncounterId.get(note.encounterId) ?? [];
    existing.push({
      id: note.id,
      iconRef: note.iconRef,
      text: note.text,
      sortOrder: note.sortOrder,
    });
    notesByEncounterId.set(note.encounterId, existing);
  }

  return {
    defaultAATemplate: aaDefaults[0]?.defaultAATemplate ?? null,
    useDefaultAA: aaDefaults[0]?.useDefaultAA ?? false,
    characters: planCharacters,
    encounterGroups,
    encounters: encounters.map((enc) => ({
      ...enc,
      notes: notesByEncounterId.get(enc.id) ?? [],
    })),
    encounterAssignments,
    aaSlotAssignments,
  };
}

export type RaidPlanContent = Awaited<ReturnType<typeof loadRaidPlanContent>>;

// unstable_cache folds the call's arguments into the key, so `version` (unused in the body)
// is what makes each edit a fresh entry.
const getCachedRaidPlanContent = unstable_cache(
  async (planId: string, _version: string) => loadRaidPlanContent(planId),
  ["raid-plan-content"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * Plan content from Vercel's shared Data Cache, read from the database only when the plan has
 * changed since the last read (by any viewer). `planId` must be the canonical id and `version`
 * the plan's current COALESCE(updated_at, created_at) — read live by the caller, alongside the
 * visibility check, so neither is ever served from cache. The linked raid is one small row read
 * live alongside it, since editing a raid doesn't move the plan's version.
 */
export async function getRaidPlanContent(planId: string, eventId: number | null, version: Date) {
  const [content, eventResult] = await Promise.all([
    getCachedRaidPlanContent(planId, version.toISOString()),
    eventId
      ? db
          .select({ raidId: raids.raidId, name: raids.name, date: raids.date })
          .from(raids)
          .where(eq(raids.raidId, eventId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return { ...content, event: eventResult[0] ?? null };
}
