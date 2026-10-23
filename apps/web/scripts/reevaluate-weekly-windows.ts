// TEMPLE-152 backfill: re-evaluate achievements at the end of every lockout week this season.
//
// Until TEMPLE-152, an evaluation's "current week" turned over at Tuesday 00:00 UTC (Monday 8pm ET)
// instead of the Tuesday 11:00 ET reset, so the evaluation triggered by each week's Monday-night
// raid already looked at the next, empty week. Tiers earned by completing a full lockout-week
// window were never awarded. Live evaluation is fixed going forward; this awards what was missed,
// by evaluating every season raider as of each week's last server-time day (Monday 23:59:59 ET),
// oldest first, then once more as of now. awardedAt is the week-end instant at which a tier was
// earned.
//
// Why Monday 23:59:59 and not the Tuesday 11:00 reset itself: a raid's start time is its date at
// ET midnight, so at Tuesday 10:59 a raid dated that Tuesday (run that evening, after the reset)
// would already count toward the old week's window. Live evaluation never sees that, since the
// raid doesn't exist yet; a backfill over today's data would, and over-award.
//
// Dry run by default — everything runs in one transaction that is rolled back. Pass --apply to
// commit. Run via:
//   doppler run --config <dev_personal|prd> -- npx tsx apps/web/scripts/reevaluate-weekly-windows.ts [--apply]

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db } from "~/server/db";
import {
  achievementTiers,
  characters,
  raidBenchMap,
  raidLogAttendeeMap,
  raidLogs,
  raids,
  seasons,
} from "~/server/db/schema";
import { evaluateAchievementsForFamilies } from "~/server/services/achievement-rules";
import { SEASON_2 } from "~/server/services/achievement-definitions";
import { EASTERN_TIMEZONE } from "~/lib/raid-formatting";

const APPLY = process.argv.includes("--apply");

class DryRunRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every lockout week's last server-time day (Monday 23:59:59 ET) since the season began, then now. */
function evaluationInstants(seasonStartDate: string, now: Date): Date[] {
  const instants: Date[] = [];
  const start = new Date(`${seasonStartDate}T00:00:00Z`);
  for (let day = 7; ; day += 7) {
    const monday = new Date(start);
    monday.setUTCDate(start.getUTCDate() + day - 1);
    const ymd = monday.toISOString().slice(0, 10);
    const weekEnd = fromZonedTime(`${ymd}T23:59:59`, EASTERN_TIMEZONE);
    if (weekEnd >= now) break;
    instants.push(weekEnd);
  }
  instants.push(now);
  return instants;
}

async function seasonRaiderFamilies(tx: Tx, seasonStartDate: string): Promise<number[]> {
  const familyRoot = sql<number>`coalesce(${characters.primaryCharacterId}, ${characters.characterId})`;
  const attended = await tx
    .selectDistinct({ familyId: familyRoot })
    .from(raidLogAttendeeMap)
    .innerJoin(characters, eq(characters.characterId, raidLogAttendeeMap.characterId))
    .innerJoin(raidLogs, eq(raidLogs.raidLogId, raidLogAttendeeMap.raidLogId))
    .innerJoin(raids, eq(raids.raidId, raidLogs.raidId))
    .where(and(gte(raids.date, seasonStartDate), eq(characters.isIgnored, false)));
  const benched = await tx
    .selectDistinct({ familyId: familyRoot })
    .from(raidBenchMap)
    .innerJoin(characters, eq(characters.characterId, raidBenchMap.characterId))
    .innerJoin(raids, eq(raids.raidId, raidBenchMap.raidId))
    .where(and(gte(raids.date, seasonStartDate), eq(characters.isIgnored, false)));
  return [...new Set([...attended, ...benched].map((r) => Number(r.familyId)))];
}

async function main() {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.name, SEASON_2.name) });
  if (!season) throw new Error(`Season "${SEASON_2.name}" not found`);
  const seasonStartDate = season.startDate.toISOString().slice(0, 10);
  // startDate is Eastern midnight stored as an instant; its UTC date is the same calendar day.

  const awarded: Array<{ achievementTierId: string; primaryCharacterId: number; asOf: Date }> = [];

  try {
    await db.transaction(async (tx) => {
      const families = await seasonRaiderFamilies(tx, seasonStartDate);
      const instants = evaluationInstants(seasonStartDate, new Date());
      console.log(
        `[reevaluate] ${families.length} season raider families x ${instants.length} instants ` +
          `(${APPLY ? "APPLY" : "dry run"})`,
      );

      for (const asOf of instants) {
        const results = await evaluateAchievementsForFamilies(
          tx as unknown as typeof db,
          families,
          asOf,
        );
        let failures = 0;
        for (const [, result] of results) {
          if ("error" in result) failures += 1;
          else for (const award of result.newAwards) awarded.push({ ...award, asOf });
        }
        console.log(
          `[reevaluate] as of ${asOf.toISOString()}: ${awarded.length} new so far, ${failures} failures`,
        );
      }

      if (awarded.length > 0) {
        const tierRows = await tx.query.achievementTiers.findMany({
          where: inArray(achievementTiers.id, [
            ...new Set(awarded.map((a) => a.achievementTierId)),
          ]),
          columns: { id: true, tier: true },
          with: { achievement: { columns: { name: true } } },
        });
        const nameRows = await tx
          .select({ id: characters.characterId, name: characters.name })
          .from(characters)
          .where(
            inArray(characters.characterId, [...new Set(awarded.map((a) => a.primaryCharacterId))]),
          );
        const tierById = new Map(tierRows.map((t) => [t.id, t]));
        const nameById = new Map(nameRows.map((c) => [c.id, c.name]));

        console.log("\nNEW AWARDS (JSON):");
        console.log(
          JSON.stringify(
            awarded.map((a) => ({
              family: nameById.get(a.primaryCharacterId) ?? String(a.primaryCharacterId),
              primaryCharacterId: a.primaryCharacterId,
              achievement: tierById.get(a.achievementTierId)?.achievement.name,
              tier: tierById.get(a.achievementTierId)?.tier,
              awardedAt: a.asOf.toISOString(),
            })),
          ),
        );
      } else {
        console.log("\nNo new awards.");
      }

      if (!APPLY) throw new DryRunRollback();
    });
    console.log(`\n[reevaluate] committed ${awarded.length} new awards.`);
  } catch (err) {
    if (err instanceof DryRunRollback) {
      console.log(`\n[reevaluate] dry run — rolled back ${awarded.length} would-be awards.`);
      return;
    }
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
