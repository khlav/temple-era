import { asc, desc, eq } from "drizzle-orm";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { db } from "~/server/db";
import {
  characterRecipeMap,
  characters,
  raidBenchMap,
  raidHelperSignupSnapshots,
  raidLogAttendeeMap,
  raidLogs,
  raidPlanCharacters,
  raidPlanTemplateEncounters,
  raidPlanTemplates,
  raidPlans,
  raidSignupSnapshotLinks,
  raids,
  recipes,
  worldBuffAssignments,
  worldBuffCharacterStatus,
} from "~/server/db/schema";
import { pickSome } from "./guard";

/**
 * Everything that neither the migrations nor the WCL import provide.
 *
 * Migrations already supply the recipe catalog (~115 rows) and the two system roles; the WCL import
 * supplies raid/raid_log/raid_log_attendee_map/character. This module fills the remaining gaps so
 * each feature area has something to render, using the imported characters as its cast.
 */

type Rng = () => number;

/**
 * Groups imported characters into families by setting primary_character_id.
 *
 * Not cosmetic: almost every aggregation in the app keys on
 * COALESCE(primary_character_id, character_id) — the attendance views, the achievement engine, the
 * rare-recipes crafter list, the GraphQL characterFamily type. With every character its own island
 * the app technically works but shows a roster of hundreds of one-raid strangers.
 *
 * Real families are officer-curated, so there is nothing to infer from a log. This picks a subset of
 * characters to act as mains and attaches a couple of alts to each.
 */
export async function seedFamilies(rng: Rng): Promise<{ families: number; alts: number }> {
  const all = await db
    .select({ id: characters.characterId })
    .from(characters)
    .orderBy(asc(characters.characterId));
  if (all.length < 6) return { families: 0, alts: 0 };

  const ids = all.map((c) => c.id);
  // ~1 main per 4 characters, so most mains end up with 1-3 alts.
  const mains = pickSome(rng, ids, Math.max(1, Math.floor(ids.length / 4)));
  const mainSet = new Set(mains);
  const candidates = ids.filter((id) => !mainSet.has(id));

  let alts = 0;
  for (const alt of candidates) {
    // Leave roughly a third of non-mains unaffiliated — solo raiders exist in the real data too.
    if (rng() < 0.33) continue;
    const main = mains[Math.floor(rng() * mains.length)]!;
    await db
      .update(characters)
      .set({ primaryCharacterId: main })
      .where(eq(characters.characterId, alt));
    alts++;
  }

  return { families: mains.length, alts };
}

/**
 * Who can craft what — the rare-recipes feature's entire payload.
 *
 * The `recipes` catalog is migration-seeded, but `character_spells` is populated one row at a time
 * through the UI (recipe.addRecipeToCharacter), so a fresh database renders the page with 115
 * recipes and no crafters at all.
 */
export async function seedRecipeKnowledge(rng: Rng): Promise<{ rows: number }> {
  const [chars, allRecipes] = await Promise.all([
    db.select({ id: characters.characterId }).from(characters),
    db.select({ id: recipes.recipeSpellId }).from(recipes),
  ]);
  if (chars.length === 0 || allRecipes.length === 0) return { rows: 0 };

  const recipeIds = allRecipes.map((r) => r.id);
  const values: { characterId: number; recipeSpellId: number }[] = [];

  for (const c of chars) {
    // Most characters know nothing rare; a minority are the guild's crafters.
    if (rng() < 0.6) continue;
    for (const recipeSpellId of pickSome(rng, recipeIds, 1 + Math.floor(rng() * 6))) {
      values.push({ characterId: c.id, recipeSpellId });
    }
  }

  if (values.length === 0) return { rows: 0 };
  await db.insert(characterRecipeMap).values(values).onConflictDoNothing();
  return { rows: values.length };
}

/**
 * Bench credit — officer-granted, so never present in a log.
 *
 * Also the only source for the "Put Me In Coach" achievement, whose rule counts raid_bench_map rows
 * (see achievement-rules.ts bench_credit_count).
 */
export async function seedBench(rng: Rng): Promise<{ rows: number }> {
  const raidRows = await db.select({ id: raids.raidId }).from(raids);
  const charRows = await db.select({ id: characters.characterId }).from(characters);
  if (raidRows.length === 0 || charRows.length === 0) return { rows: 0 };

  const charIds = charRows.map((c) => c.id);
  const values: { raidId: number; characterId: number }[] = [];
  for (const r of raidRows) {
    for (const characterId of pickSome(rng, charIds, Math.floor(rng() * 4))) {
      values.push({ raidId: r.id, characterId });
    }
  }
  if (values.length === 0) return { rows: 0 };
  await db.insert(raidBenchMap).values(values).onConflictDoNothing();
  return { rows: values.length };
}

/**
 * Raid Helper signup snapshots and their raid links.
 *
 * Without these, two achievements can never be awarded at all — achievement-rules.ts scores
 * consistency_match (Steadfast) and flexibility_match (Flexible) by reading
 * raid_signup_snapshot_link -> raid_helper_signup_snapshot.signups — and the signup-history
 * reporting views have nothing to show. Real snapshots come from a QStash-scheduled capture against
 * the live Raid Helper API, which local dev has no meaningful data for.
 *
 * Signups are derived from each raid's actual attendees so the match logic has real names to match
 * against: mostly "primary" status with a few bench/late/absence entries mixed in.
 */
export async function seedSignupSnapshots(rng: Rng): Promise<{ snapshots: number; links: number }> {
  const raidRows = await db
    .select({ id: raids.raidId, date: raids.date, zone: raids.zone, name: raids.name })
    .from(raids)
    .orderBy(asc(raids.raidId));
  if (raidRows.length === 0) return { snapshots: 0, links: 0 };

  let snapshots = 0;
  let links = 0;

  for (const r of raidRows) {
    const attendees = await db
      .select({ name: characters.name, className: characters.class, spec: characters.classDetail })
      .from(raidLogAttendeeMap)
      .innerJoin(raidLogs, eq(raidLogs.raidLogId, raidLogAttendeeMap.raidLogId))
      .innerJoin(characters, eq(characters.characterId, raidLogAttendeeMap.characterId))
      .where(eq(raidLogs.raidId, r.id));
    if (attendees.length === 0) continue;

    const eventId = String(10_000_000_000_000_000n + BigInt(r.id));
    // Raid nights are 20:00 ET; the exact hour only has to be consistent with the link row.
    const startTime = new Date(`${r.date}T00:00:00Z`);
    startTime.setUTCHours(20);

    const signups = attendees.map((a, i) => ({
      userId: String(20_000_000_000_000_000n + BigInt(i)),
      name: a.name,
      className: a.className,
      specName: a.spec ?? a.className,
      roleName: "DPS",
      // A realistic spread: mostly confirmed, with the occasional bench/late/absence so the
      // consistency and flexibility rules see variation instead of a flat roster.
      status: rng() < 0.85 ? "primary" : rng() < 0.5 ? "bench" : rng() < 0.5 ? "late" : "absence",
      position: i,
      entryTime: Math.floor(startTime.getTime() / 1000) - 86_400,
    }));

    // One row per checkpoint would be more faithful, but the rules only ever read the closest
    // snapshot, so a single 24h capture is enough and keeps the seed fast.
    await db
      .insert(raidHelperSignupSnapshots)
      .values({
        raidHelperEventId: eventId,
        resolvedEventId: eventId,
        checkpoint: "24h",
        targetTime: new Date(startTime.getTime() - 24 * 3_600_000),
        startTime,
        signUpCount: signups.length,
        signups,
        title: r.name,
        zone: r.zone,
        zoneSource: "title_parse",
      })
      .onConflictDoNothing();
    snapshots++;

    await db
      .insert(raidSignupSnapshotLinks)
      .values({
        raidId: r.id,
        raidHelperEventId: eventId,
        startTime,
        source: "auto",
        confidence: 1,
        matchReason: {
          timingDeltaMinutes: 0,
          timingScore: 1,
          zoneScore: 1,
          zoneMatchQuality: "exact_title_parse",
        },
      })
      .onConflictDoNothing();
    links++;
  }

  return { snapshots, links };
}

/**
 * Raid plan templates — one per configured zone.
 *
 * These are reference data that no migration seeds and that the WCL import knows nothing about;
 * they are normally authored through /raid-manager/raid-planner/config. With zero templates the
 * planner still loads but every plan is encounter-less, so the whole feature reads as broken.
 */
export async function seedRaidPlanTemplates(): Promise<{ templates: number; encounters: number }> {
  // Encounter lists are intentionally short and approximate — enough structure to exercise the
  // planner's grouping, assignment and AA-slot UI without pretending to be an accurate boss list.
  const ENCOUNTERS: Record<string, string[]> = {
    mc: ["Lucifron", "Magmadar", "Golemagg", "Majordomo", "Ragnaros"],
    bwl: ["Razorgore", "Vaelastrasz", "Broodlord", "Firemaw", "Chromaggus", "Nefarian"],
    naxxramas: [
      "Anub'Rekhan",
      "Faerlina",
      "Maexxna",
      "Patchwerk",
      "Thaddius",
      "Sapphiron",
      "Kel'Thuzad",
    ],
    aq40: ["Skeram", "Sartura", "Fankriss", "Huhuran", "Twin Emperors", "C'Thun"],
    aq20: ["Kurinnaxx", "Rajaxx", "Moam", "Ossirian"],
    zg: ["Venoxis", "Jeklik", "Mandokir", "Thekal", "Hakkar"],
    onyxia: ["Onyxia"],
  };

  let templates = 0;
  let encounters = 0;

  for (const [i, zone] of RAID_ZONE_CONFIG.entries()) {
    const [tpl] = await db
      .insert(raidPlanTemplates)
      .values({
        zoneId: zone.instance,
        zoneName: zone.name,
        defaultGroupCount: 8,
        isActive: true,
        sortOrder: i,
      })
      .onConflictDoNothing()
      .returning({ id: raidPlanTemplates.id });
    if (!tpl) continue;
    templates++;

    const names = ENCOUNTERS[zone.instance] ?? [zone.name];
    await db.insert(raidPlanTemplateEncounters).values(
      names.map((encounterName, idx) => ({
        templateId: tpl.id,
        encounterKey: `${zone.instance}-${encounterName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        encounterName,
        sortOrder: idx,
      })),
    );
    encounters += names.length;
  }

  return { templates, encounters };
}

/**
 * A couple of raid plans with rosters.
 *
 * The real creation flow reads the live Raid Helper API and syncs signups from it, which local dev
 * cannot do, so these are built directly with synthetic raid_helper_event_ids (the column is NOT
 * NULL and uniquely indexed).
 */
export async function seedRaidPlans(rng: Rng): Promise<{ plans: number; roster: number }> {
  const recent = await db
    .select({ id: raids.raidId, name: raids.name, zone: raids.zone, date: raids.date })
    .from(raids)
    // Newest first: the seed shifts dates so the latest raid lands today, and plans attached to
    // stale lockout weeks would defeat that.
    .orderBy(desc(raids.date))
    .limit(3);
  if (recent.length === 0) return { plans: 0, roster: 0 };

  const charRows = await db
    .select({ id: characters.characterId, name: characters.name })
    .from(characters);
  if (charRows.length === 0) return { plans: 0, roster: 0 };

  let plans = 0;
  let roster = 0;

  for (const r of recent) {
    const zoneId = RAID_ZONE_CONFIG.find((z) => z.name === r.zone)?.instance ?? "custom";
    const [plan] = await db
      .insert(raidPlans)
      .values({
        raidHelperEventId: String(30_000_000_000_000_000n + BigInt(r.id)),
        zoneId,
        name: `${r.name} — plan`,
        useDefaultAA: true,
        isPublic: true,
        startAt: new Date(`${r.date}T20:00:00Z`),
      })
      .onConflictDoNothing()
      .returning({ id: raidPlans.id });
    if (!plan) continue;
    plans++;

    const picked = pickSome(rng, charRows, Math.min(25, charRows.length));
    await db.insert(raidPlanCharacters).values(
      picked.map((c, idx) => ({
        raidPlanId: plan.id,
        characterId: c.id,
        characterName: c.name,
        defaultGroup: Math.floor(idx / 5) + 1,
        defaultPosition: (idx % 5) + 1,
      })),
    );
    roster += picked.length;
  }

  return { plans, roster };
}

/**
 * World buff queue + history.
 *
 * Both tables are UI-created and deliberately keyed on free-text character names (so a non-raider
 * can submit), so nothing else populates them. Seeding gives the dashboard queue and the manager
 * views something to show.
 */
export async function seedWorldBuffs(rng: Rng): Promise<{ statuses: number; assignments: number }> {
  const charRows = await db
    .select({ id: characters.characterId, name: characters.name })
    .from(characters)
    .limit(120);
  if (charRows.length === 0) return { statuses: 0, assignments: 0 };

  const ITEMS = ["rends_head", "onyxias_head", "nefarians_head", "hakkars_heart"] as const;
  const QUEUES = ["main", "alt", "backup"] as const;

  const picked = pickSome(rng, charRows, Math.min(45, charRows.length));
  const statusIds: string[] = [];

  for (const c of picked) {
    const dropped = rng() < 0.3;
    const [row] = await db
      .insert(worldBuffCharacterStatus)
      .values({
        characterName: c.name,
        characterNameNormalized: c.name.toLowerCase(),
        characterId: c.id,
        item: ITEMS[Math.floor(rng() * ITEMS.length)]!,
        state: dropped ? "dropped" : "ready_to_drop",
        queueType: QUEUES[Math.floor(rng() * QUEUES.length)]!,
        droppedAt: dropped ? new Date(Date.now() - Math.floor(rng() * 14) * 86_400_000) : null,
        // A few stale entries so the "marked inactive" filtering is exercised.
        markedInactiveAt: rng() < 0.1 ? new Date(Date.now() - 30 * 86_400_000) : null,
      })
      .returning({ id: worldBuffCharacterStatus.id });
    if (row) statusIds.push(row.id);
  }

  const toSchedule = pickSome(rng, statusIds, Math.min(12, statusIds.length));
  if (toSchedule.length > 0) {
    await db.insert(worldBuffAssignments).values(
      toSchedule.map((statusId) => ({
        statusId,
        scheduledAt: new Date(Date.now() + Math.floor(rng() * 7) * 86_400_000),
      })),
    );
  }

  return { statuses: statusIds.length, assignments: toSchedule.length };
}

/** Wipes everything this module writes, so the seed can be re-run without a container reset. */
export async function clearSyntheticData(): Promise<void> {
  // Order matters only where there are FKs; the rest is independent.
  await db.delete(worldBuffAssignments);
  await db.delete(worldBuffCharacterStatus);
  await db.delete(raidPlanCharacters);
  await db.delete(raidPlans);
  await db.delete(raidPlanTemplateEncounters);
  await db.delete(raidPlanTemplates);
  await db.delete(raidSignupSnapshotLinks);
  await db.delete(raidHelperSignupSnapshots);
  await db.delete(raidBenchMap);
  await db.delete(characterRecipeMap);
  // Unaffiliate every character; seedFamilies re-derives the groupings from scratch.
  await db.update(characters).set({ primaryCharacterId: null });
}
