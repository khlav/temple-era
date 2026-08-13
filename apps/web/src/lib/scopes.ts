// Closed, code-enforced set — every scope must correspond to an actual guard in code.
// `<resource>:manage` = real CRUD surface exists (bundles viewing + mutating as one grant).
// `<capability>:access` = a feature-access gate with no CRUD surface to manage.
//
// Kept dependency-free (no drizzle-orm/db schema imports) so client components can import it
// directly without pulling the server-only DB schema graph into the client bundle.

/**
 * Named constants for every scope. Reference these (`SCOPE.RAIDLOG_MANAGE`) rather than raw
 * string literals at call sites: renaming a scope then touches exactly one line here, and the
 * editor can find every usage.
 */
export const SCOPE = {
  RAIDLOG_MANAGE: "raidlog:manage",
  RAIDPLAN_MANAGE: "raidplan:manage",
  CHARACTER_MANAGE: "character:manage",
  USERPERMISSIONS_MANAGE: "userpermissions:manage",
  TEMPLAR_ACCESS: "templar:access",
  SOFTRES_ACCESS: "softres:access",
  API_TOKEN_ACCESS: "api-token:access",
  WORLDBUFF_MANAGE: "worldbuff:manage",
} as const;

export type Scope = (typeof SCOPE)[keyof typeof SCOPE];

/**
 * Ordered tuple of every scope. Separate from `SCOPE` because drizzle's `pgEnum` requires a
 * readonly tuple (`[T, ...T[]]`), which `Object.values()` cannot produce.
 *
 * ORDER IS SIGNIFICANT: it defines the Postgres `scope` enum's member order and must stay in
 * sync with `drizzle/0025_add_roles_permissions_schema.sql` and the `meta/*_snapshot.json`
 * files. Append new scopes at the end unless you are regenerating the migration.
 */
export const SCOPES = [
  SCOPE.RAIDLOG_MANAGE,
  SCOPE.RAIDPLAN_MANAGE,
  SCOPE.CHARACTER_MANAGE,
  SCOPE.USERPERMISSIONS_MANAGE,
  SCOPE.TEMPLAR_ACCESS,
  SCOPE.SOFTRES_ACCESS,
  SCOPE.API_TOKEN_ACCESS,
  SCOPE.WORLDBUFF_MANAGE,
] as const;

// Compile-time guard: adding a scope to SCOPE but forgetting to list it in SCOPES (so it would
// be missing from the DB enum) is a type error here rather than a runtime migration failure.
type ScopesMissingFromTuple = Exclude<Scope, (typeof SCOPES)[number]>;
const _scopesTupleIsExhaustive: ScopesMissingFromTuple extends never ? true : never = true;
void _scopesTupleIsExhaustive;

// Sentinel id/name for the synthetic, env-derived Superadmin role (see SUPERADMIN_DISCORD_IDS).
// It has no row in `role`, and deliberately isn't a uuid so it can't collide with one. Lives here
// rather than in access-service.ts so client components can import it without pulling the
// server-only DB graph into the client bundle.
export const SUPERADMIN_ROLE_ID = "superadmin";
export const SUPERADMIN_ROLE_NAME = "Superadmin";
