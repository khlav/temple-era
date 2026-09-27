/**
 * Seeds the local Docker development database (TEMPLE-136).
 *
 *   pnpm db:local:seed                 # the normal path (wraps the doppler invocation below)
 *   doppler run --project temple-era --config dev_personal -- npx tsx apps/web/scripts/seed/seed-local.ts
 *
 * Flags:
 *   --count=N         how many raid logs to import (default 25)
 *   --seed=N          PRNG seed, so a given run is reproducible (default 1)
 *   --refresh-ids     re-query prod for the newest log IDs instead of using the cached list
 *   --skip-harvest    skip raid data entirely; seed only the synthetic parts
 *   --no-shift-dates  keep the real historical raid dates
 *   --no-achievements skip the achievement bootstrap (the slowest step)
 *
 * Why this exists rather than `db:clone-prod`: Supabase bills data egress, and cloning pulls every
 * row of prod (including real OAuth tokens). This reads ~25 raid log *IDs* from prod — a few KB —
 * and rebuilds the interesting data locally from the Warcraft Logs API, which costs nothing.
 *
 * Safe by construction: the first thing it does is refuse to run against a non-local DATABASE_URL.
 */
import { env } from "~/env";
import { db } from "~/server/db";
import { assertLocalDatabase, makeRng, step } from "./guard";
import { ensureDevUser } from "./dev-user";
import { harvestLogIds } from "./harvest";
import { importLogs, shiftRaidDatesToRecent } from "./import-logs";
import {
  clearSyntheticData,
  seedBench,
  seedFamilies,
  seedRaidPlanTemplates,
  seedRaidPlans,
  seedRecipeKnowledge,
  seedSignupSnapshots,
  seedWorldBuffs,
} from "./synthetic";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numArg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const parsed = hit ? Number(hit.split("=")[1]) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main(): Promise<void> {
  // Before anything else, and before any import that might touch the database.
  assertLocalDatabase(env.DATABASE_URL);

  const count = numArg("count", 25);
  const rng = makeRng(numArg("seed", 1));
  const skipHarvest = flag("skip-harvest");
  const shiftDates = !flag("no-shift-dates");

  console.log(`Seeding local database (count=${count}, shiftDates=${shiftDates})\n`);

  let done = step("clearing previously seeded synthetic data");
  await clearSyntheticData();
  done();

  done = step("dev user");
  const { userId, discordId } = await ensureDevUser();
  done(`discord ${discordId}`);

  if (!skipHarvest) {
    done = step(`harvesting ${count} newest raid log IDs from prod`);
    const logs = await harvestLogIds({ count, refresh: flag("refresh-ids") });
    done(`${logs.length} ids`);

    done = step(`importing ${logs.length} logs from Warcraft Logs`);
    const { imported, skipped } = await importLogs({ logs, userId });
    done(`${imported} imported, ${skipped.length} skipped`);
    for (const s of skipped) console.log(`    skipped: ${s}`);

    if (shiftDates) {
      done = step("shifting raid dates into the current lockout window");
      const { shiftedDays, raidCount } = await shiftRaidDatesToRecent();
      done(`${raidCount} raids moved +${shiftedDays}d`);
    }
  }

  done = step("grouping characters into families");
  const fam = await seedFamilies(rng);
  done(`${fam.families} mains, ${fam.alts} alts`);

  done = step("recipe knowledge (rare recipes)");
  done(`${(await seedRecipeKnowledge(rng)).rows} rows`);

  done = step("bench credit");
  done(`${(await seedBench(rng)).rows} rows`);

  done = step("signup snapshots + raid links");
  const snap = await seedSignupSnapshots(rng);
  done(`${snap.snapshots} snapshots, ${snap.links} links`);

  done = step("raid plan templates");
  const tpl = await seedRaidPlanTemplates();
  done(`${tpl.templates} templates, ${tpl.encounters} encounters`);

  done = step("raid plans");
  const plans = await seedRaidPlans(rng);
  done(`${plans.plans} plans, ${plans.roster} roster rows`);

  done = step("world buffs");
  const wb = await seedWorldBuffs(rng);
  done(`${wb.statuses} statuses, ${wb.assignments} assignments`);

  if (!flag("no-achievements")) {
    // Reuses the existing bootstrap verbatim — it already seeds the season + definitions from
    // achievement-definitions.ts and evaluates awards across every family, idempotently. Run as a
    // child process rather than imported because that script exports nothing and calls
    // process.exit(0) on success, which would terminate this one before it finished.
    console.log("→ achievements (definitions + evaluation) ...");
    const { spawnSync } = await import("node:child_process");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // cwd is apps/web regardless of where the seed was invoked from, since that script resolves
    // the ~/* path alias through apps/web/tsconfig.json. Spawned as `node --import tsx` rather
    // than through a shell: passing args with shell: true is deprecated (DEP0190) because they
    // are concatenated unescaped. Env (including everything Doppler injected) is inherited.
    const appsWeb = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/bootstrap-achievements.ts"],
      { stdio: "inherit", cwd: appsWeb },
    );
    if (result.status !== 0) throw new Error("bootstrap-achievements.ts failed");
  }

  console.log("\nSeed complete.");
}

await main()
  .catch((error: unknown) => {
    console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // The app's db singleton holds a pool open; without this the script hangs on exit.
    await db.$client.end({ timeout: 5 });
  });
