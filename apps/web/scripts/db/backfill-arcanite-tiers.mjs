#!/usr/bin/env node
// One-time backfill: adds the arcanite tier to Steadfast, Flexible, and On Deck — the three
// Core-group achievements that shipped without one and had it added after the achievements
// themselves already existed. `seedAchievementDefinitions` (achievement-definitions.ts) only
// inserts achievements whose name doesn't already exist in the DB, so it can never retrofit a
// tier onto one that does; this script is the retrofit for any environment (a fresh prod clone,
// staging, a teammate's local DB) whose achievement/achievement_tier rows predate that change.
//
// Idempotent: skips an achievement that already has an arcanite tier, so it's safe to run
// against an environment that's already caught up.
//
// Run with: doppler run --config <dev|stg|prd> -- node scripts/db/backfill-arcanite-tiers.mjs
import postgres from "postgres";
import crypto from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[backfill-arcanite-tiers] No DATABASE_URL set — run this under `doppler run`.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

// Same ruleConfig shapes/values as the matching entries in achievement-definitions.ts (STEADFAST,
// FLEXIBLE, PUT_ME_IN_COACH) — keep both in sync if this ladder ever changes.
const ARCANITE_TIERS = {
  Steadfast: { shape: "consistency_match", minCount: 40 },
  Flexible: { shape: "flexibility_match", minCount: 40 },
  "On Deck": { shape: "bench_credit_count", minCount: 40 },
};

try {
  for (const [name, ruleConfig] of Object.entries(ARCANITE_TIERS)) {
    const [achievement] = await sql`select id from achievement where name = ${name}`;
    if (!achievement) {
      console.warn(`[backfill-arcanite-tiers] skip: achievement "${name}" not found`);
      continue;
    }
    const [existing] = await sql`
      select id from achievement_tier
      where achievement_id = ${achievement.id} and tier = 'arcanite'
    `;
    if (existing) {
      console.log(`[backfill-arcanite-tiers] skip: "${name}" already has an arcanite tier`);
      continue;
    }
    const id = crypto.randomUUID();
    await sql`
      insert into achievement_tier (id, achievement_id, tier, rule_config)
      values (${id}, ${achievement.id}, 'arcanite', ${sql.json(ruleConfig)})
    `;
    console.log(`[backfill-arcanite-tiers] inserted arcanite tier for "${name}": ${JSON.stringify(ruleConfig)}`);
  }
} finally {
  await sql.end({ timeout: 1 });
}
