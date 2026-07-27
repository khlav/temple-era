#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

load_env_files
require_command psql

DB_ENV_NAME="${1:-DATABASE_MIGRATION_URL}"
DB_URL="$(resolve_url_from_env "$DB_ENV_NAME")"

echo "Running database preflight using $DB_ENV_NAME"

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
\echo === connection ===
select current_database() as database_name,
       current_user as current_user,
       inet_server_addr() as server_address,
       inet_server_port() as server_port;

\echo === size ===
select pg_size_pretty(pg_database_size(current_database())) as database_size,
       pg_database_size(current_database()) as database_size_bytes;

\echo === version ===
select version();

\echo === extensions ===
select extname, extversion
from pg_extension
order by extname;

\echo === schemas ===
select schema_name
from information_schema.schemata
where schema_name in ('public', 'views')
order by schema_name;
SQL
