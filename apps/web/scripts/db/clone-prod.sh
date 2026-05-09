#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

load_env_files
require_command pg_dump
require_command pg_restore
require_command psql

PROD_DB_URL="$(resolve_url_from_env "DATABASE_PROD_URL")"
DEV_DB_URL="$(resolve_url_from_env "DATABASE_URL")"

DUMP_FILE="$(mktemp /tmp/prod-clone.XXXXXX.dump)"
TOC_FILE="$(mktemp /tmp/prod-clone.XXXXXX.toc)"
trap 'rm -f "$DUMP_FILE" "$TOC_FILE"' EXIT

echo "Dumping production database (public, views, drizzle schemas)..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=views \
  --schema=drizzle \
  --file="$DUMP_FILE" \
  "$PROD_DB_URL"

echo "Wiping dev database..."
psql "$DEV_DB_URL" -c "
  DROP SCHEMA IF EXISTS public CASCADE;
  DROP SCHEMA IF EXISTS views CASCADE;
  DROP SCHEMA IF EXISTS drizzle CASCADE;
  CREATE SCHEMA public;
  CREATE SCHEMA views;
  CREATE SCHEMA drizzle;
  CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;
  CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" SCHEMA public;
"

# Build a filtered TOC that excludes schema/extension creation (already handled above)
pg_restore --list "$DUMP_FILE" \
  | grep -v -E "^[0-9]+;.*(SCHEMA|EXTENSION|COMMENT - SCHEMA)" \
  > "$TOC_FILE"

echo "Restoring into dev database..."
pg_restore \
  --dbname="$DEV_DB_URL" \
  --no-owner \
  --no-privileges \
  --use-list="$TOC_FILE" \
  "$DUMP_FILE"

echo "Clone complete."
