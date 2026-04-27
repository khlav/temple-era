#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

load_env_files
require_command psql

SOURCE_ENV_NAME="${1:-SOURCE_DATABASE_URL}"
TARGET_ENV_NAME="${2:-TARGET_DATABASE_URL}"
SOURCE_DB_URL="$(resolve_url_from_env "$SOURCE_ENV_NAME")"
TARGET_DB_URL="$(resolve_url_from_env "$TARGET_ENV_NAME")"

COUNT_SQL="$(cat <<'SQL'
with table_counts as (
  select 'auth_account' as table_name, count(*)::bigint as row_count from public.auth_account
  union all select 'auth_session', count(*)::bigint from public.auth_session
  union all select 'auth_user', count(*)::bigint from public.auth_user
  union all select 'auth_verification_token', count(*)::bigint from public.auth_verification_token
  union all select 'character', count(*)::bigint from public.character
  union all select 'character_spells', count(*)::bigint from public.character_spells
  union all select 'raid', count(*)::bigint from public.raid
  union all select 'raid_bench_map', count(*)::bigint from public.raid_bench_map
  union all select 'raid_log', count(*)::bigint from public.raid_log
  union all select 'raid_log_attendee_map', count(*)::bigint from public.raid_log_attendee_map
  union all select 'raid_plan', count(*)::bigint from public.raid_plan
  union all select 'raid_plan_character', count(*)::bigint from public.raid_plan_character
  union all select 'raid_plan_encounter', count(*)::bigint from public.raid_plan_encounter
  union all select 'raid_plan_encounter_aa_slot', count(*)::bigint from public.raid_plan_encounter_aa_slot
  union all select 'raid_plan_encounter_assignment', count(*)::bigint from public.raid_plan_encounter_assignment
  union all select 'raid_plan_encounter_group', count(*)::bigint from public.raid_plan_encounter_group
  union all select 'raid_plan_presence', count(*)::bigint from public.raid_plan_presence
  union all select 'raid_plan_template', count(*)::bigint from public.raid_plan_template
  union all select 'raid_plan_template_encounter', count(*)::bigint from public.raid_plan_template_encounter
  union all select 'raid_plan_template_encounter_group', count(*)::bigint from public.raid_plan_template_encounter_group
  union all select 'recipes', count(*)::bigint from public.recipes
)
select table_name, row_count
from table_counts
order by table_name;
SQL
)"

SOURCE_COUNTS_FILE="$(mktemp)"
TARGET_COUNTS_FILE="$(mktemp)"
trap 'rm -f "$SOURCE_COUNTS_FILE" "$TARGET_COUNTS_FILE"' EXIT

psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -At -F $'\t' -c "$COUNT_SQL" >"$SOURCE_COUNTS_FILE"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -At -F $'\t' -c "$COUNT_SQL" >"$TARGET_COUNTS_FILE"

printf "%-36s %14s %14s %8s\n" "table" "source" "target" "status"
printf "%-36s %14s %14s %8s\n" "------------------------------------" "--------------" "--------------" "--------"

HAS_DIFF=0

while IFS=$'\t' read -r table_name source_count; do
  target_count="$(awk -F $'\t' -v table_name="$table_name" '$1 == table_name { print $2 }' "$TARGET_COUNTS_FILE")"

  if [ -z "$target_count" ]; then
    target_count="missing"
    status="DIFF"
    HAS_DIFF=1
  elif [ "$source_count" = "$target_count" ]; then
    status="OK"
  else
    status="DIFF"
    HAS_DIFF=1
  fi

  printf "%-36s %14s %14s %8s\n" "$table_name" "$source_count" "$target_count" "$status"
done <"$SOURCE_COUNTS_FILE"

if [ "$HAS_DIFF" -ne 0 ]; then
  echo "Row-count comparison found mismatches" >&2
  exit 1
fi

echo "Row-count comparison passed"
