import { unstable_cache } from "next/cache";
import { aliasedTable, and, eq, isNull, sql } from "drizzle-orm";
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

// 24h fallback only. Freshness comes from the cache keys: each part below is keyed on its own
// version column, which the touch triggers in drizzle/0006 move whenever that part changes. An edit
// therefore lands on a new key for its part alone, with no revalidateTag call at the router's
// mutation sites.
const REVALIDATE_SECONDS = 60 * 60 * 24;

/*
 * A raid plan's viewer-agnostic content, cached in four kinds of part (TEMPLE-161). It used to be
 * one entry keyed on raid_plan.updated_at, so every edit re-read the whole plan, ~150 AA-slot rows
 * included: on raid night, one full read per edit, about 190 an hour. Now an edit re-reads only its
 * own part:
 *
 *   roster      raid_plan_character                     raid_plan.roster_updated_at
 *   layout      encounters (the rows) and their groups  raid_plan.layout_updated_at
 *   default AA  the default/trash AA template and slots raid_plan.default_aa_updated_at
 *   encounter   one encounter's assignments, AA slots   raid_plan_encounter.content_updated_at
 *               and notes
 *
 * The versions are read live alongside the plan's visibility (planPartVersionColumns), so no
 * version is ever served from cache. Clients are unaffected: they still poll raid_plan.updated_at
 * and get the whole plan back, assembled from the parts.
 *
 * Every cached value goes through JSON: no Date fields. Only data whose changes move a part's
 * version belongs here. The linked raid (name, date) is edited independently of the plan, so
 * getRaidPlanContent reads it live instead.
 */

async function loadRoster(planId: string) {
  const primaryCharacters = aliasedTable(characters, "primary_characters");
  return db
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
      class: sql<string | null>`COALESCE(${characters.class}, ${raidPlanCharacters.writeInClass})`,
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
    );
}

async function loadLayout(planId: string) {
  const [encounters, encounterGroups] = await Promise.all([
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
  return { encounters, encounterGroups };
}

const aaSlotColumns = {
  id: raidPlanEncounterAASlots.id,
  encounterId: raidPlanEncounterAASlots.encounterId,
  raidPlanId: raidPlanEncounterAASlots.raidPlanId,
  planCharacterId: raidPlanEncounterAASlots.planCharacterId,
  slotName: raidPlanEncounterAASlots.slotName,
  sortOrder: raidPlanEncounterAASlots.sortOrder,
};

async function loadDefaultAA(planId: string) {
  const [defaults, slots] = await Promise.all([
    db
      .select({
        defaultAATemplate: raidPlans.defaultAATemplate,
        useDefaultAA: raidPlans.useDefaultAA,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, planId))
      .limit(1),
    // A slot with encounter_id set belongs to that encounter, whatever its raid_plan_id says; the
    // aa-slot trigger files it the same way.
    db
      .select(aaSlotColumns)
      .from(raidPlanEncounterAASlots)
      .where(
        and(
          eq(raidPlanEncounterAASlots.raidPlanId, planId),
          isNull(raidPlanEncounterAASlots.encounterId),
        ),
      )
      .orderBy(raidPlanEncounterAASlots.sortOrder),
  ]);
  return {
    defaultAATemplate: defaults[0]?.defaultAATemplate ?? null,
    useDefaultAA: defaults[0]?.useDefaultAA ?? false,
    slots,
  };
}

async function loadEncounterContent(encounterId: string, includeAssignments: boolean) {
  const [notes, assignments, aaSlots] = await Promise.all([
    db
      .select({
        id: raidPlanEncounterNotes.id,
        iconRef: raidPlanEncounterNotes.iconRef,
        text: raidPlanEncounterNotes.text,
        sortOrder: raidPlanEncounterNotes.sortOrder,
      })
      .from(raidPlanEncounterNotes)
      .where(eq(raidPlanEncounterNotes.encounterId, encounterId))
      .orderBy(raidPlanEncounterNotes.sortOrder),
    // Assignments only apply to encounters with custom groups
    includeAssignments
      ? db
          .select({
            encounterId: raidPlanEncounterAssignments.encounterId,
            planCharacterId: raidPlanEncounterAssignments.planCharacterId,
            groupNumber: raidPlanEncounterAssignments.groupNumber,
            position: raidPlanEncounterAssignments.position,
          })
          .from(raidPlanEncounterAssignments)
          .where(eq(raidPlanEncounterAssignments.encounterId, encounterId))
          .orderBy(
            raidPlanEncounterAssignments.groupNumber,
            raidPlanEncounterAssignments.position,
            raidPlanEncounterAssignments.planCharacterId,
          )
      : Promise.resolve([]),
    db
      .select(aaSlotColumns)
      .from(raidPlanEncounterAASlots)
      .where(eq(raidPlanEncounterAASlots.encounterId, encounterId))
      .orderBy(raidPlanEncounterAASlots.sortOrder),
  ]);
  return { notes, assignments, aaSlots };
}

// unstable_cache folds the call's arguments into the key, so each version argument (unused in the
// body) is what makes an edit to that part a fresh entry.
const getCachedRoster = unstable_cache(
  async (planId: string, _version: string) => loadRoster(planId),
  ["raid-plan-roster"],
  { revalidate: REVALIDATE_SECONDS },
);
const getCachedLayout = unstable_cache(
  async (planId: string, _version: string) => loadLayout(planId),
  ["raid-plan-layout"],
  { revalidate: REVALIDATE_SECONDS },
);
const getCachedDefaultAA = unstable_cache(
  async (planId: string, _version: string) => loadDefaultAA(planId),
  ["raid-plan-default-aa"],
  { revalidate: REVALIDATE_SECONDS },
);
// useDefaultGroups decides whether assignments load at all. It's a layout field, so flipping it
// moves layout_updated_at rather than this encounter's version; passing it here gives the flip a
// new key too.
const getCachedEncounterContent = unstable_cache(
  async (encounterId: string, includeAssignments: boolean, _version: string) =>
    loadEncounterContent(encounterId, includeAssignments),
  ["raid-plan-encounter-content"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * The part versions, to spread into the select that reads the plan's head row (which must be FROM
 * raid_plan). Read live on every call, in the same statement as the visibility check, so the
 * versions and the encounter list they cover come from one snapshot. Encounter versions come back as
 * Postgres's own timestamp text, keeping the microseconds a JS Date would drop.
 */
export const planPartVersionColumns = {
  rosterUpdatedAt: raidPlans.rosterUpdatedAt,
  layoutUpdatedAt: raidPlans.layoutUpdatedAt,
  defaultAAUpdatedAt: raidPlans.defaultAAUpdatedAt,
  // Spelled out with an alias: in a single-table select Drizzle renders columns unqualified, which
  // would make the correlation compare raid_plan_encounter's own columns with each other.
  encounterVersions: sql<Record<string, string> | null>`(
    SELECT json_object_agg(rpe.id, rpe.content_updated_at)
    FROM raid_plan_encounter rpe
    WHERE rpe.raid_plan_id = "raid_plan"."id"
  )`,
};

export interface RaidPlanPartVersions {
  rosterUpdatedAt: Date;
  layoutUpdatedAt: Date;
  defaultAAUpdatedAt: Date;
  encounterVersions: Record<string, string> | null;
}

/**
 * Plan content from Vercel's shared Data Cache, each part read from the database only when it has
 * changed since the last read (by any viewer). `planId` must be the canonical id and `versions` the
 * row read live by the caller via planPartVersionColumns. The linked raid is one small row read live
 * alongside it, since editing a raid doesn't move any plan version.
 */
export async function getRaidPlanContent(
  planId: string,
  eventId: number | null,
  versions: RaidPlanPartVersions,
) {
  const [roster, layout, defaultAA, eventResult] = await Promise.all([
    getCachedRoster(planId, versions.rosterUpdatedAt.toISOString()),
    getCachedLayout(planId, versions.layoutUpdatedAt.toISOString()),
    getCachedDefaultAA(planId, versions.defaultAAUpdatedAt.toISOString()),
    eventId
      ? db
          .select({ raidId: raids.raidId, name: raids.name, date: raids.date })
          .from(raids)
          .where(eq(raids.raidId, eventId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // The layout entry is keyed on the layout version read with the map, so its encounter list matches
  // the map's. The one exception is a layout loaded just after an encounter was added, which can list
  // an encounter the map lacks; that one is keyed on the layout version, which moves again on the
  // next layout edit.
  const encounterContents = await Promise.all(
    layout.encounters.map((enc) =>
      getCachedEncounterContent(
        enc.id,
        !enc.useDefaultGroups,
        versions.encounterVersions?.[enc.id] ?? `layout:${versions.layoutUpdatedAt.toISOString()}`,
      ),
    ),
  );

  // Reassemble the single-entry shape this replaced: assignments ordered by encounter, then group
  // and position; AA slots by sortOrder across the default set and every encounter.
  const encounterAssignments = layout.encounters
    .map((enc, i) => ({ id: enc.id, assignments: encounterContents[i]!.assignments }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((enc) => enc.assignments);
  const aaSlotAssignments = [
    ...defaultAA.slots,
    ...encounterContents.flatMap((content) => content.aaSlots),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    defaultAATemplate: defaultAA.defaultAATemplate,
    useDefaultAA: defaultAA.useDefaultAA,
    characters: roster,
    encounterGroups: layout.encounterGroups,
    encounters: layout.encounters.map((enc, i) => ({
      ...enc,
      notes: encounterContents[i]!.notes,
    })),
    encounterAssignments,
    aaSlotAssignments,
    event: eventResult[0] ?? null,
  };
}
