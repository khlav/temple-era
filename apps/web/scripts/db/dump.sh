#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

load_env_files
require_command pg_dump

MODE="${1:-full}"
SOURCE_ENV_NAME="${2:-SOURCE_DATABASE_URL}"
SOURCE_DB_URL="$(resolve_url_from_env "$SOURCE_ENV_NAME")"
DUMP_FILE="${DUMP_FILE:-$(default_dump_path "$MODE")}"

case "$MODE" in
  full)
    EXTRA_FLAGS=()
    ;;
  data-only)
    EXTRA_FLAGS=(--data-only)
    ;;
  *)
    echo "Unsupported dump mode: $MODE" >&2
    echo "Expected one of: full, data-only" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$DUMP_FILE")"

echo "Creating $MODE dump from $SOURCE_ENV_NAME"
echo "Writing artifact to $DUMP_FILE"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --exclude-schema=neon_auth \
  --verbose \
  "${EXTRA_FLAGS[@]}" \
  --file="$DUMP_FILE" \
  "$SOURCE_DB_URL"

echo "Dump complete: $DUMP_FILE"
