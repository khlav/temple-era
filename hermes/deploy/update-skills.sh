#!/usr/bin/env bash
#
# Deploys hermes/skills/ to the Hermes host: fetch, validate, check out, and restart the gateway —
# but only when the skills actually changed. Run by an n8n SSH node through an authorized_keys forced
# command (see hermes/deploy/README.md), so it takes NO input from the caller. The HERMES_* variables
# below exist for the sandbox test (test-update-skills.sh); the forced-command path never sets them.
#
# Usage: update-skills.sh [--check]     --check fetches and reports, but changes nothing live.
#
# Exit codes:
#   0  deployed and healthy, or nothing to do
#   1  could not get the update lock
#   2  candidate failed validation — nothing was changed
#   3  gateway unhealthy after the restart — rolled back, and healthy again
#   4  gateway unhealthy after the restart AND after the rollback — needs a human

set -euo pipefail

REPO_DIR="${HERMES_SKILLS_REPO_DIR:-/opt/temple-era}"
REF="${HERMES_SKILLS_REF:-main}"
SERVICE="${HERMES_SKILLS_SERVICE:-hermes-gateway-temple-era.service}"
HERMES_HOME="${HERMES_HOME:-/root/.hermes/profiles/temple-era}"
# Worst case is drain (TimeoutStopSec=90) + RestartSec=60 + startup, so leave real headroom.
HEALTH_TIMEOUT="${HERMES_SKILLS_HEALTH_TIMEOUT:-240}"
POLL_SECS="${HERMES_SKILLS_POLL_SECS:-5}"
LOCK_FILE="${HERMES_SKILLS_LOCK_FILE:-/var/lock/hermes-skills-update.lock}"
SKILLS_PATH="hermes/skills"
# The commit whose skills the running gateway was last started with. Kept apart from the checkout's
# HEAD on purpose: a deploy interrupted after the checkout (SSH dropped, script killed) must be
# retried next time, not mistaken for "already up to date". Inside .git so it is never in the tree.
MARKER="$REPO_DIR/.git/hermes-deployed-sha"

CHECK_ONLY=0
if [ "${1:-}" = "--check" ]; then CHECK_ONLY=1; fi

log() {
  echo "[hermes-skills] $*"
  logger -t hermes-skills -- "$*" 2>/dev/null || true
}

repo() { git -C "$REPO_DIR" "$@"; }

mark_deployed() { printf '%s\n' "$1" >"$MARKER"; }

# Reads one field of the gateway's own state file. Prints nothing if the file is missing/unreadable.
state_field() {
  python3 - "$HERMES_HOME/gateway_state.json" "$1" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
if sys.argv[2] == "pid":
    print(d.get("pid", ""))
elif sys.argv[2] == "healthy":
    ok = d.get("gateway_state") == "running" and d.get("platforms", {}).get("discord", {}).get("state") == "connected"
    print("1" if ok else "0")
PY
}

# Healthy = running + Discord connected AND a different process than `before` (so a stale state
# file from the process that is about to exit can't pass for the new one). Empty `before` = any.
wait_healthy() {
  local before="$1" waited=0 now
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    sleep "$POLL_SECS"
    waited=$((waited + POLL_SECS))
    if [ "$(state_field healthy)" = "1" ]; then
      now="$(state_field pid)"
      if [ -z "$before" ] || [ "$now" != "$before" ]; then return 0; fi
    fi
  done
  return 1
}

# Every skill folder needs a SKILL.md whose frontmatter names the folder and has a description.
validate_skills() {
  local root="$1" bad=0 dir name file frontmatter
  if [ ! -d "$root/$SKILLS_PATH" ]; then
    log "invalid: candidate has no $SKILLS_PATH"
    return 1
  fi
  for dir in "$root/$SKILLS_PATH"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    file="${dir}SKILL.md"
    if [ ! -f "$file" ]; then
      log "invalid: $name has no SKILL.md"
      bad=1
      continue
    fi
    # Frontmatter = the lines between the first two '---'; empty if the file doesn't open with one.
    frontmatter="$(tr -d '\r' <"$file" | awk 'NR==1 { if ($0 != "---") exit; next } $0 == "---" { exit } { print }')"
    # Fixed-string match: a folder name is data, never a regex.
    if ! printf '%s\n' "$frontmatter" | grep -Fxq -e "name: $name" -e "name: \"$name\"" -e "name: '$name'"; then
      log "invalid: $name/SKILL.md frontmatter must have name: $name"
      bad=1
    fi
    if ! printf '%s\n' "$frontmatter" | grep -Eq '^description:[[:space:]]*[^[:space:]]'; then
      log "invalid: $name/SKILL.md frontmatter must have a description"
      bad=1
    fi
  done
  return "$bad"
}

exec 9>"$LOCK_FILE"
if ! flock -w 300 9; then
  log "could not get the update lock within 300s"
  exit 1
fi

repo fetch --quiet --depth 1 --filter=blob:none origin "$REF"
new="$(repo rev-parse FETCH_HEAD)"
head="$(repo rev-parse HEAD)"
deployed=""
if [ -f "$MARKER" ]; then deployed="$(tr -d '[:space:]' <"$MARKER")"; fi

if [ -n "$deployed" ] && [ "$new" = "$deployed" ]; then
  log "already deployed at ${new:0:12}, nothing to do"
  exit 0
fi

# What we roll back to: the last deployed commit, else the checkout as it was before this run.
base="${deployed:-$head}"

skills_changed=1
if [ -z "$deployed" ]; then
  # No record of what the gateway loaded (first run, or the clone was re-created): never assume it
  # matches HEAD — an earlier run may have been killed right after its checkout. Converge instead:
  # restart once if there are skills to load; nothing to do if the candidate has none yet.
  if ! repo cat-file -e "$new:$SKILLS_PATH" 2>/dev/null; then skills_changed=0; fi
# A base commit we can't read (e.g. garbage-collected) counts as "changed": converge, don't guess.
elif repo diff --quiet --no-renames "$deployed" "$new" -- "$SKILLS_PATH" 2>/dev/null; then
  skills_changed=0
fi

if [ "$skills_changed" -eq 0 ]; then
  if [ "$CHECK_ONLY" -eq 1 ]; then
    log "check: ${base:0:12} -> ${new:0:12}, $SKILLS_PATH unchanged, would not restart"
    exit 0
  fi
  repo checkout --quiet --detach "$new"
  mark_deployed "$new"
  log "advanced ${base:0:12} -> ${new:0:12}; $SKILLS_PATH unchanged, no restart"
  exit 0
fi

# Validate the candidate from git objects BEFORE touching the live checkout: a broken skill is
# rejected with nothing changed, so it never needs a rollback.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if ! repo archive "$new" "$SKILLS_PATH" | tar -x -C "$tmp"; then
  log "invalid: could not read $SKILLS_PATH at ${new:0:12}"
  exit 2
fi
if ! validate_skills "$tmp"; then
  log "candidate ${new:0:12} rejected; staying on ${base:0:12}"
  exit 2
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  log "check: would deploy ${base:0:12} -> ${new:0:12} and reload $SERVICE"
  exit 0
fi

repo checkout --quiet --detach "$new"
pid_before="$(state_field pid)"
log "deploying ${base:0:12} -> ${new:0:12}; reloading $SERVICE (drain-first)"
if systemctl reload "$SERVICE" && wait_healthy "$pid_before"; then
  mark_deployed "$new"
  log "gateway healthy on ${new:0:12}"
  exit 0
fi

log "gateway not healthy after reload; rolling back to ${base:0:12}"
repo checkout --quiet --detach "$base" || log "could not check out ${base:0:12} for the rollback"
pid_before="$(state_field pid)"
systemctl restart "$SERVICE" || true
if wait_healthy "$pid_before"; then
  log "rolled back to ${base:0:12}; gateway healthy"
  exit 3
fi
log "gateway UNHEALTHY after rollback to ${base:0:12} — needs a human"
exit 4
