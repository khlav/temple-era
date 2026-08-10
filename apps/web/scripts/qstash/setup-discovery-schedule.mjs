#!/usr/bin/env node
// Registers (or updates) the QStash Schedule that periodically triggers the Raid Helper
// signup snapshot discovery poll. schedules.create upserts by scheduleId, so this is
// safe to re-run — it is NOT wired into the automatic Vercel deploy pipeline, since it's
// one-time-per-environment provisioning rather than a build step.
//
// Run once per environment:
//   doppler run --config <dev|stg|prd> -- node scripts/qstash/setup-discovery-schedule.mjs
import { Client } from "@upstash/qstash";

const qstashToken = process.env.QSTASH_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const dopplerConfig = process.env.DOPPLER_CONFIG;

if (!qstashToken) {
  console.error("[setup-discovery-schedule] QSTASH_TOKEN is not set.");
  process.exit(1);
}
if (!appUrl) {
  console.error("[setup-discovery-schedule] NEXT_PUBLIC_APP_URL is not set.");
  process.exit(1);
}
if (!dopplerConfig) {
  // QSTASH_TOKEN is shared across dev/stg/prd (same QStash account for all three — see
  // the TEMPLE-76 plan). scheduleId is the *identity key* schedules.create upserts by,
  // not destination — a fixed scheduleId run for staging after production would silently
  // overwrite production's schedule to point at staging's URL. DOPPLER_CONFIG (auto-set
  // by `doppler run`) scopes it correctly without a new arg or env var.
  console.error(
    "[setup-discovery-schedule] Run via `doppler run --config <env> -- ...` — DOPPLER_CONFIG " +
      "is required to scope the scheduleId per environment.",
  );
  process.exit(1);
}

const scheduleId = `raid-helper-signup-discovery-${dopplerConfig}`;
const destination = new URL("/api/qstash/raid-helper-discovery", appUrl).toString();

const client = new Client({ token: qstashToken });
const schedule = await client.schedules.create({
  destination,
  cron: "*/30 * * * *",
  scheduleId,
});

console.log(`[setup-discovery-schedule] Upserted "${schedule.scheduleId}" -> ${destination}`);
