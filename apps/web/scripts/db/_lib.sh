#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

load_env_files() {
  if [ -f "$REPO_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
  fi

  if [ -f "$REPO_ROOT/.env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env.local"
    set +a
  fi
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_env() {
  local env_name="$1"
  local env_value="${!env_name:-}"

  if [ -z "$env_value" ]; then
    echo "Missing required environment variable: $env_name" >&2
    exit 1
  fi
}

resolve_url_from_env() {
  local env_name="$1"

  require_env "$env_name"
  printf '%s\n' "${!env_name}"
}

timestamp_utc() {
  date -u +"%Y%m%dT%H%M%SZ"
}

default_dump_path() {
  local mode="$1"

  mkdir -p "$REPO_ROOT/backups/db-migration"
  printf '%s\n' "$REPO_ROOT/backups/db-migration/$(timestamp_utc)-${mode}.dump"
}
