#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

load_env_files
require_command pg_restore

TARGET_ENV_NAME="${1:-TARGET_DATABASE_URL}"
TARGET_DB_URL="$(resolve_url_from_env "$TARGET_ENV_NAME")"

if [ -z "${DUMP_FILE:-}" ]; then
  echo "Missing required environment variable: DUMP_FILE" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

JOBS="${RESTORE_JOBS:-1}"
RESTORE_FLAGS=(
  --dbname="$TARGET_DB_URL"
  --jobs="$JOBS"
  --no-owner
  --no-privileges
  --verbose
)

if [ "${RESTORE_CLEAN:-0}" = "1" ]; then
  RESTORE_FLAGS+=(--clean --if-exists)
fi

echo "Restoring $DUMP_FILE into $TARGET_ENV_NAME"

pg_restore "${RESTORE_FLAGS[@]}" "$DUMP_FILE"

echo "Restore complete"
