# Follow-up: operational notes from the scopes-enforcement rework (PR #284)

**Status:** informational — nothing actionable is blocked on this, but keep it until the items below resolve themselves.

## Prod backup

A pre-migration restore point exists at `backups/db-migration/20260727T045621Z-full.dump`
(local, gitignored per the `/backups/` entry — see `docs/monorepo-migration-plan.md` R1). Keep it
until the new role/`user_role` data has been stable in production for a while. This is the same
data the legacy `is_raid_manager`/`is_admin` columns back up at the schema level — see
`docs/followups/legacy-access-booleans-cleanup.md` item 3 for why those columns also shouldn't be
dropped yet.

## Migrations 0025/0026 were edited in place, not appended to

Per the established convention on this branch (PR #284 was unmerged for the duration of the
rework), `drizzle/0025_add_roles_permissions_schema.sql` and
`drizzle/0026_backfill_roles_permissions_data.sql` were edited in place multiple times rather than
layering new migration files on top, each time re-verifying the PR was still unmerged first.

Practical consequence: anyone who cloned dev before the final version of these files landed has a
dev DB whose applied-migration hash no longer matches what's on disk. `pnpm db:migrate` won't
error in that case — `drizzle-kit` just sees nothing new to apply and silently no-ops. The fix is
`pnpm db:clone-prod` (dev is disposable, prod is the source of truth) before running `db:migrate`
again. If anyone reports "the new scopes don't exist" after pulling this branch, this is the first
thing to check.

## Process lesson: four bugs surfaced after the work was reported clean

During implementation of PR #284, four real bugs were found only because the user pushed back and
asked for more verification after an initial "this is done and clean" report — including two
broken Discord bot commands and a privilege-escalation path on the `create-raid` endpoint (a scope
check that should have blocked it didn't, because the code that read the caller's permissions used
a variant form the grep sweep missed).

Root cause in each case: verification greps were written for the *expected* shape of a permission
check (`user.isRaidManager`, say) and missed other forms actually present in the codebase —
`access.isRaidManager`, or an `a || b` boolean-chain form that doesn't literal-match a single
pattern. A narrow grep finding zero hits reads as confirmation, but only proves that exact string
doesn't exist — not that the property isn't read some other way.

**For future cross-repo/cross-file authorization audits** (the Phase 7 contracts work in
`docs/monorepo-migration-plan.md` is the next one that will need this): enumerate and classify
every occurrence of the property/field in question first — every read site, in every syntactic
form it could appear in — before concluding a sweep is complete. Don't pattern-match for the
shape you expect to find.
