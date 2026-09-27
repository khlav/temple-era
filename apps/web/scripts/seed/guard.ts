/**
 * Refuses to let the seed run against anything but a local database.
 *
 * The seed writes randomized, synthetic data and truncates as it goes, so pointing it at a shared
 * database would be destructive in a way that is not obviously recoverable. Everything downstream
 * assumes this check has passed — it is the single reason the rest of the seed can be careless
 * about deleting rows.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

export function assertLocalDatabase(databaseUrl: string): void {
  let host: string;
  try {
    // The postgres:// scheme parses fine as a URL; only the hostname matters here.
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a parseable URL — refusing to seed.");
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      [
        `Refusing to seed: DATABASE_URL points at "${host}", which is not a local host.`,
        "",
        "This script writes synthetic data and deletes rows as it goes. It is only ever safe",
        "against the local Docker container (see docker-compose.yml).",
        "",
        "Expected something like postgresql://postgres:postgres@localhost:55432/temple_era_dev",
        "— which is what the Doppler dev_personal config provides.",
      ].join("\n"),
    );
  }
}

/** Small seeded PRNG so a given --seed reproduces the same database. */
export function makeRng(seed: number): () => number {
  // mulberry32 — short, dependency-free, and good enough for picking fake rosters.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickSome<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  return out;
}

export function step(label: string): (detail?: string) => void {
  const started = Date.now();
  process.stdout.write(`→ ${label} ... `);
  return (detail) => {
    const ms = Date.now() - started;
    console.log(`done (${ms}ms)${detail ? ` — ${detail}` : ""}`);
  };
}
