# Supabase Migration Runbook

This project uses Supabase as hosted Postgres only. Application auth remains in the existing NextAuth + Drizzle tables under `public`, and application traffic stays on `postgres-js`.

## Connection Model

Supabase exposes two pooler endpoints. The `db.<ref>.supabase.co` direct connection hostname is not available on newer Supabase projects — use the pooler URLs exclusively.

| Endpoint                             | Port   | Mode    | Use for                                          |
| ------------------------------------ | ------ | ------- | ------------------------------------------------ |
| `aws-1-<region>.pooler.supabase.com` | `5432` | Session | Vercel, Migrations, `pg_dump`, `pg_restore`, dev |

- `DATABASE_URL`: runtime application traffic. Use the **session pooler (port 5432)** for all environments.
- `DATABASE_MIGRATION_URL`: schema admin, dump/restore, and Drizzle migration traffic. Use the **session pooler (port 5432)**.

The session pooler (port 5432) supports all PostgreSQL features, including prepared statements, which avoids the issues encountered with the transaction pooler (port 6543).

## Recommended Environment Variables

```bash
# Runtime (session pooler, port 5432)
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres

# Migrations (session pooler, port 5432)
DATABASE_MIGRATION_URL=postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres

NEON_DATABASE_URL=postgresql://...          # source for production export
SUPABASE_DEV_MIGRATION_URL=postgresql://... # DEV session pooler (port 5432) for rehearsal
SUPABASE_PROD_MIGRATION_URL=postgresql://...# PROD session pooler (port 5432) for cutover
```

The helper scripts below use `SOURCE_DATABASE_URL` and `TARGET_DATABASE_URL` by default. You can either export those directly or map them from the environment-specific variables above inline when running a command.

Dump artifacts exclude the Neon-managed `neon_auth` schema so provider-specific objects are not restored into Supabase.

## Prerequisites

`pg_dump` and `pg_restore` must be at least as new as the server being dumped. Supabase runs PostgreSQL 17, so you need the PostgreSQL 17 client tools:

```bash
brew install postgresql@17
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
```

Add the `PATH` export to your shell profile to make it permanent, or prefix each `pnpm db:migration:*` command with it when running ad hoc.

## Rehearsal Workflow

1. Preflight the source and target databases.
2. Rehearse a full Neon dump into Supabase DEV.
3. Compare row counts.
4. Spot-check views, login, and write paths.

### 1. Preflight

```bash
SOURCE_DATABASE_URL="$NEON_DATABASE_URL" pnpm db:migration:preflight SOURCE_DATABASE_URL
TARGET_DATABASE_URL="$SUPABASE_DEV_MIGRATION_URL" pnpm db:migration:preflight TARGET_DATABASE_URL
```

The preflight script prints:

- database size
- Postgres version
- installed extensions
- presence of the `public` and `views` schemas

### 2. Full dump rehearsal

```bash
SOURCE_DATABASE_URL="$NEON_DATABASE_URL" pnpm db:migration:dump:full

DUMP_FILE=/absolute/path/to/backups/db-migration/<timestamp>-full.dump \
TARGET_DATABASE_URL="$SUPABASE_DEV_MIGRATION_URL" \
RESTORE_CLEAN=1 \
pnpm db:migration:restore
```

Notes:

- `RESTORE_CLEAN=1` adds `--clean --if-exists` to `pg_restore`.
- Rehearse against a reset or disposable DEV target when restoring schema + data together.
- If full restore collides with schema management, fall back to `pnpm db:migrate` against `DATABASE_MIGRATION_URL`, then use the data-only dump path below.

### 3. Data-only fallback

```bash
SOURCE_DATABASE_URL="$NEON_DATABASE_URL" pnpm db:migration:dump:data

DATABASE_URL="$SUPABASE_DEV_MIGRATION_URL" \
DATABASE_MIGRATION_URL="$SUPABASE_DEV_MIGRATION_URL" \
pnpm db:migrate

DUMP_FILE=/absolute/path/to/backups/db-migration/<timestamp>-data-only.dump \
TARGET_DATABASE_URL="$SUPABASE_DEV_MIGRATION_URL" \
pnpm db:migration:restore
```

## Row Count Validation

Compare Neon to Supabase after a rehearsal or cutover:

```bash
SOURCE_DATABASE_URL="$NEON_DATABASE_URL" \
TARGET_DATABASE_URL="$SUPABASE_DEV_MIGRATION_URL" \
pnpm db:migration:compare
```

The comparison checks these critical tables:

- `auth_account`
- `auth_session`
- `auth_user`
- `auth_verification_token`
- `character`
- `character_spells`
- `raid`
- `raid_bench_map`
- `raid_log`
- `raid_log_attendee_map`
- `raid_plan*`
- `recipes`

## Production Cutover

1. Run the full rehearsal successfully in DEV.
2. Prepare Vercel env vars ahead of time:
   - `DATABASE_URL` -> Supabase PROD runtime URL
   - `DATABASE_MIGRATION_URL` -> Supabase PROD admin URL
3. Enter a write freeze.
4. Create a final Neon dump.
5. Restore into a clean Supabase PROD database.
6. Run row-count validation and smoke tests.
7. Flip Vercel env vars and redeploy.

### Final export

```bash
SOURCE_DATABASE_URL="$NEON_DATABASE_URL" pnpm db:migration:dump:full
```

Preserve the generated dump artifact as the rollback snapshot.

### Production restore

```bash
DUMP_FILE=/absolute/path/to/backups/db-migration/<timestamp>-full.dump \
TARGET_DATABASE_URL="$SUPABASE_PROD_MIGRATION_URL" \
RESTORE_CLEAN=1 \
pnpm db:migration:restore
```

### Production parity check

```bash
SOURCE_DATABASE_URL="$NEON_DATABASE_URL" \
TARGET_DATABASE_URL="$SUPABASE_PROD_MIGRATION_URL" \
pnpm db:migration:compare
```

## Acceptance Checklist

- Row counts match on all critical tables.
- `views` schema queries succeed.
- Discord sign-in creates and reads sessions correctly.
- Raid create/edit flows work.
- Report queries work.
- New inserts do not collide on sequence-backed IDs.
- Runtime traffic through Supabase session pooler (port 5432) works correctly.

## Rollback

Rollback is environment-switch only:

1. Restore Vercel `DATABASE_URL` to Neon.
2. Restore Vercel `DATABASE_MIGRATION_URL` to Neon admin URL if needed.
3. Redeploy immediately.

Do not attempt back-sync from failed Supabase writes during the first cutover.
