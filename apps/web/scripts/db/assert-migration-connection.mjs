#!/usr/bin/env node
// Fails the deploy with a readable reason when the migration database is unreachable.
//
// `drizzle-kit migrate` renders its progress as a spinner and writes a connection failure into
// that same line, so the whole thing reaches a CI log as
// `[⣻] applying migrations... ELIFECYCLE Command failed with exit code 1` — no host, no cause,
// nothing to act on. On 2026-11-18 that turned a suspended Supabase staging project into a Vercel
// check that said only "deployment has failed", and cost an hour of looking at application code
// that was fine.
//
// So: prove the connection first, and say precisely what is wrong if it cannot be made. This
// never runs migrations; `drizzle-kit migrate` still does that, immediately after.
import postgres from "postgres";

// Matches drizzle.config.ts — schema work needs the session-mode URL, not the transaction pooler.
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const LABEL = "[db-preflight]";
const CONNECT_TIMEOUT_SECONDS = 10;

if (!databaseUrl) {
  console.error(
    `${LABEL} Neither DATABASE_MIGRATION_URL nor DATABASE_URL is set, so migrations cannot run.`,
  );
  console.error(`${LABEL} Set them in the Doppler config this deploy reads from.`);
  process.exit(1);
}

/** Host and port only — the URL carries credentials and this output goes to build logs. */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "") || "(default)";
    return `${parsed.hostname}:${parsed.port || "5432"}/${database}`;
  } catch {
    return "(unparseable connection URL)";
  }
}

/**
 * The actionable part. These are the failures that actually happen with Supabase + Supavisor, and
 * each one points somewhere different — a paused project is not a bad password.
 */
function hint(error) {
  const message = `${error?.message ?? ""} ${error?.code ?? ""}`;

  if (/tenant or user not found|tenant\/user .* not found/i.test(message)) {
    return [
      "Supavisor does not recognise this project. Usually the Supabase project is paused or",
      "suspended — check the Supabase dashboard and resume it. If the project was recreated, its",
      "ref changed and the URL in Doppler is stale.",
    ].join(" ");
  }
  if (/password authentication failed|no password supplied|SASL/i.test(message)) {
    return "The credentials in the URL are wrong. Re-copy the connection string into Doppler.";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return "The host does not resolve. Check the hostname in the URL for a typo or a region change.";
  }
  if (/ETIMEDOUT|CONNECT_TIMEOUT|ECONNREFUSED|ECONNRESET/i.test(message)) {
    return [
      "The host did not accept a connection. Either it is unreachable from this network, or the",
      "database is still starting up.",
    ].join(" ");
  }
  if (/does not exist/i.test(message)) {
    return "The server answered but the database named in the URL does not exist.";
  }
  return "Check the Supabase project's status and the connection string in Doppler.";
}

const target = describeTarget(databaseUrl);
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: CONNECT_TIMEOUT_SECONDS,
  // A preflight that retried would just reproduce drizzle-kit's silence, slowly.
  idle_timeout: 1,
  onnotice: () => {},
});

try {
  await sql`select 1`;
  console.log(`${LABEL} ${target} is reachable; running migrations.`);
} catch (error) {
  console.error(`${LABEL} Cannot reach the migration database at ${target}.`);
  console.error(`${LABEL} ${error?.message ?? error}`);
  console.error(`${LABEL} ${hint(error)}`);
  // Migrations have not run. Fail rather than deploy code against an un-migrated database.
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
