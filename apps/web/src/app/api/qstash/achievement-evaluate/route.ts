import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { characters, raidBenchMap, raidLogAttendeeMap, raidLogs } from "~/server/db/schema";
import { verifyQstashRequest } from "~/server/services/qstash-verify";
import { evaluateAchievementsForFamilies } from "~/server/services/achievement-rules";

// Cron-triggered-function duration limits apply the same way to QStash-triggered ones.
export const maxDuration = 60;

interface AchievementEvaluateBody {
  raidId: number;
  trigger: "raid_log_import" | "signup_link_resolved" | "bench_updated";
}

function isAchievementEvaluateBody(value: unknown): value is AchievementEvaluateBody {
  if (typeof value !== "object" || value === null) return false;
  const { raidId, trigger } = value as Record<string, unknown>;
  return (
    typeof raidId === "number" &&
    (trigger === "raid_log_import" ||
      trigger === "signup_link_resolved" ||
      trigger === "bench_updated")
  );
}

/** A raid can have more than one raidLogs row (raidLogs.raidId is a nullable FK, not
 *  1:1), so this joins across every log for the raid rather than assuming exactly one.
 *  Family resolution and de-duplication both happen in SQL (coalesce + selectDistinct),
 *  matching this codebase's established convention (world-buff-service.ts's
 *  reactivateFamiliesAfterRaid) rather than resolving characterIds into JS first.
 *
 *  Unions log attendees with `raid_bench_map` entries — a bench-only character (never in the
 *  log) earns real credit (see achievement-rules.ts's `benchedRaids`/scoreBenchCreditCount) and
 *  must be evaluated too, regardless of which of the three triggers fired. */
async function resolvePrimaryCharacterIdsForRaid(raidId: number): Promise<number[]> {
  const familyRoot = sql<number>`coalesce(${characters.primaryCharacterId}, ${characters.characterId})`;
  const attendeeRows = await db
    .selectDistinct({ primaryCharacterId: familyRoot })
    .from(raidLogAttendeeMap)
    .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
    .innerJoin(characters, eq(raidLogAttendeeMap.characterId, characters.characterId))
    .where(and(eq(raidLogs.raidId, raidId), eq(raidLogAttendeeMap.isIgnored, false)));
  const benchRows = await db
    .selectDistinct({ primaryCharacterId: familyRoot })
    .from(raidBenchMap)
    .innerJoin(characters, eq(raidBenchMap.characterId, characters.characterId))
    .where(eq(raidBenchMap.raidId, raidId));
  return [...new Set([...attendeeRows, ...benchRows].map((r) => r.primaryCharacterId))];
}

export async function POST(request: Request) {
  const verification = await verifyQstashRequest(request);
  if (!verification.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verification.body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isAchievementEvaluateBody(payload)) {
    return NextResponse.json({ error: "Expected { raidId, trigger }" }, { status: 400 });
  }

  try {
    const primaryCharacterIds = await resolvePrimaryCharacterIdsForRaid(payload.raidId);

    // One family's evaluation failure (e.g. a malformed signup snapshot) must not abort
    // evaluation for the rest of this raid's attendees — evaluateAchievementsForFamilies
    // isolates each family's own scoring step internally, so this loop only has to read
    // its results, not catch around each call itself.
    const evaluations = await evaluateAchievementsForFamilies(db, primaryCharacterIds, new Date());
    let newAwardsTotal = 0;
    let failures = 0;
    for (const [primaryCharacterId, result] of evaluations) {
      if ("error" in result) {
        logger.error(
          { err: result.error, raidId: payload.raidId, primaryCharacterId },
          "Achievement evaluation failed for family",
        );
        failures += 1;
      } else {
        newAwardsTotal += result.newAwards.length;
      }
    }

    return NextResponse.json({
      raidId: payload.raidId,
      trigger: payload.trigger,
      familiesEvaluated: primaryCharacterIds.length,
      newAwards: newAwardsTotal,
      failures,
    });
  } catch (error) {
    logger.error({ err: error, raidId: payload.raidId }, "Achievement evaluate route failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
