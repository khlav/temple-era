#!/usr/bin/env node
/**
 * Guard against stale `pnpm --filter <name>` references.
 *
 * Why this exists: pnpm's filter flag, given a package name that does not
 * exist, prints "No projects matched the filters" and **exits 0**. It does not
 * fail. So renaming a workspace package silently turns every stale reference
 * into a no-op, and the build stays green while doing nothing. During the
 * monorepo migration that would have meant production deploying without ever
 * running its database migrations.
 *
 * Path-based filters ("./apps/bot") are immune to renames and are skipped.
 *
 * Run from the repo root:  node .github/scripts/check-filters.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const SELF = normalize(".github/scripts/check-filters.mjs");
const MANIFESTS = ["package.json", "apps/web/package.json", "apps/bot/package.json"];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const SEARCH = [
  "package.json",
  "lefthook.yml",
  "turbo.json",
  "apps/web/package.json",
  "apps/bot/package.json",
  "apps/bot/Dockerfile",
  ...walk(".github"),
].filter((f) => normalize(f) !== SELF);

/** Strip comments so prose mentioning --filter is not treated as a real call. */
function stripComments(file, text) {
  if (/\.(mjs|js|ts)$/.test(file)) {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }
  // yml, Dockerfile, and friends: '#' starts a comment. Only strip whole-line
  // comments — a trailing '#' inside a quoted shell string is not worth chasing.
  return text.replace(/^\s*#.*$/gm, "");
}

const packages = new Set(MANIFESTS.map((f) => JSON.parse(readFileSync(f, "utf8")).name));

console.log("workspace packages:");
for (const p of packages) console.log("  " + p);

const RE = /--filter\s+["']?([^\s"',]+)["']?/g;
// A real reference is a package name or a relative path. Anything with angle
// brackets or backticks is placeholder prose that survived comment-stripping.
const LOOKS_REAL = /^[@A-Za-z0-9._/-]+(\.\.\.)?$/;

const refs = new Map();
for (const file of SEARCH) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const m of stripComments(file, text).matchAll(RE)) {
    const ref = m[1];
    if (!LOOKS_REAL.test(ref)) continue;
    if (!refs.has(ref)) refs.set(ref, []);
    if (!refs.get(ref).includes(file)) refs.get(ref).push(file);
  }
}

if (refs.size === 0) {
  console.error(
    "::error::Found no --filter references at all. This guard is not checking " +
      "anything — the file list or regex is wrong.",
  );
  process.exit(1);
}

let bad = 0;
console.log("\nfilter references:");
for (const [ref, files] of [...refs].sort()) {
  const name = ref.replace(/\.\.\.$/, "");
  if (name.startsWith("./") || name.startsWith("{")) {
    console.log(`  ⊘ ${ref}  (path-based, rename-proof)`);
  } else if (packages.has(name)) {
    console.log(`  ✅ ${ref}`);
  } else {
    console.error(
      `::error::--filter '${ref}' matches no workspace package. ` +
        `Referenced in: ${files.join(", ")}`,
    );
    bad++;
  }
}

if (bad > 0) {
  console.error(`\n${bad} stale filter reference(s). pnpm would exit 0 on these.`);
  process.exit(1);
}
console.log("\n✅ all --filter references resolve");
