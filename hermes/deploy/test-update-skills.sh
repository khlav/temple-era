#!/usr/bin/env bash
#
# Sandbox test for update-skills.sh. Builds a throwaway origin repo, a scratch deploy checkout, a
# fake HERMES_HOME and a stub `systemctl`, then drives the REAL script through every path:
# --check, deploy, no-op rerun, skills-unchanged advance, rollback on an unhealthy gateway, and
# rejection of a broken skill. Touches nothing outside one mktemp dir, never the real gateway.
# Needs bash, git, python3, flock — run it on the Hermes host or any Linux box.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/update-skills.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

export HERMES_SKILLS_REPO_DIR="$T/deploy"
export HERMES_HOME="$T/home"
export HERMES_SKILLS_LOCK_FILE="$T/lock"
export HERMES_SKILLS_SERVICE="fake.service"
export HERMES_SKILLS_HEALTH_TIMEOUT=6
export HERMES_SKILLS_POLL_SECS=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
mkdir -p "$T/bin" "$HERMES_HOME"

# Stub systemctl: `reload` swaps in a new healthy "process" unless STUB_MODE=reload-dead;
# `restart` always does. The state file is the same shape the real gateway writes.
cat >"$T/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
newproc() {
  echo "{\"pid\": $RANDOM$RANDOM, \"gateway_state\": \"running\", \"platforms\": {\"discord\": {\"state\": \"connected\"}}}" >"$HERMES_HOME/gateway_state.json"
}
case "$1" in
  reload) [ "${STUB_MODE:-}" = "reload-dead" ] || newproc ;;
  restart) newproc ;;
esac
STUB
chmod +x "$T/bin/systemctl"
export PATH="$T/bin:$PATH"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
expect_eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }
head_of() { git -C "$HERMES_SKILLS_REPO_DIR" rev-parse HEAD; }
pid_of() { python3 -c "import json;print(json.load(open('$HERMES_HOME/gateway_state.json'))['pid'])"; }

# --- fixtures: origin with one valid skill, deploy checkout cloned the way the README says ---
src="$T/src"
mkdir -p "$src/hermes/skills/demo"
git -C "$src" init -q -b main
skill() { printf -- '---\nname: %s\ndescription: %s\n---\n\nbody %s\n' "$1" "$2" "$3" >"$src/hermes/skills/$1/SKILL.md"; }
commit() { git -C "$src" add -A && git -C "$src" commit -q -m "$1" && git -C "$src" push -q "$T/origin.git" main; }
skill demo "a demo skill" v1
git -C "$src" add -A && git -C "$src" commit -q -m c1
git clone -q --bare "$src" "$T/origin.git"
git -C "$T/origin.git" config uploadpack.allowFilter true
git -C "$T/origin.git" config uploadpack.allowAnySHA1InWant true
git clone -q --depth 1 --filter=blob:none --sparse "file://$T/origin.git" "$HERMES_SKILLS_REPO_DIR"
git -C "$HERMES_SKILLS_REPO_DIR" sparse-checkout set hermes/skills
git -C "$src" remote add origin "$T/origin.git" 2>/dev/null || true
echo '{"pid": 1, "gateway_state": "running", "platforms": {"discord": {"state": "connected"}}}' >"$HERMES_HOME/gateway_state.json"

c1="$(head_of)"

echo "1. skills changed: --check reports, changes nothing"
skill demo "a demo skill" v2 && commit c2
out="$("$SCRIPT" --check)"
echo "$out" | grep -q "would deploy" && ok "reports it would deploy" || bad "reports it would deploy: $out"
expect_eq "live checkout untouched" "$(head_of)" "$c1"
expect_eq "gateway untouched" "$(pid_of)" "1"

echo "2. skills changed: deploys, reloads, waits for a new healthy process"
"$SCRIPT" >/dev/null && ok "exits 0" || bad "exits 0"
c2="$(git -C "$T/origin.git" rev-parse main)"
expect_eq "checkout advanced" "$(head_of)" "$c2"
[ "$(pid_of)" != "1" ] && ok "gateway process replaced" || bad "gateway process replaced"
grep -q "v2" "$HERMES_SKILLS_REPO_DIR/hermes/skills/demo/SKILL.md" && ok "new skill content is live" || bad "new skill content is live"

echo "3. rerun with nothing new: no-op"
pid_now="$(pid_of)"
"$SCRIPT" | grep -q "nothing to do" && ok "says nothing to do" || bad "says nothing to do"
expect_eq "no restart" "$(pid_of)" "$pid_now"

echo "4. only non-skill files changed: advances, does NOT restart"
echo readme >"$src/README" && commit c3
"$SCRIPT" | grep -q "no restart" && ok "says no restart" || bad "says no restart"
expect_eq "checkout advanced" "$(head_of)" "$(git -C "$T/origin.git" rev-parse main)"
expect_eq "no restart" "$(pid_of)" "$pid_now"
c3="$(head_of)"

echo "5. gateway never comes back after reload: rolls back, exits 3, healthy again"
skill demo "a demo skill" v4 && commit c4
set +e
STUB_MODE=reload-dead "$SCRIPT" >/dev/null
rc=$?
set -e
expect_eq "exits 3" "$rc" "3"
expect_eq "rolled back to previous commit" "$(head_of)" "$c3"
[ "$(state_h=$(python3 -c "import json;d=json.load(open('$HERMES_HOME/gateway_state.json'));print(d['gateway_state'])"); echo "$state_h")" = "running" ] && ok "gateway healthy after rollback" || bad "gateway healthy after rollback"

echo "6. broken skill: rejected before anything changes, exits 2"
printf -- '---\nname: wrong-name\ndescription: x\n---\n' >"$src/hermes/skills/demo/SKILL.md" && commit c5
pid_now="$(pid_of)"
set +e
"$SCRIPT" >/dev/null
rc=$?
set -e
expect_eq "exits 2" "$rc" "2"
expect_eq "live checkout untouched" "$(head_of)" "$c3"
expect_eq "gateway untouched" "$(pid_of)" "$pid_now"

echo "7. deploy interrupted after the checkout (script killed): the next run still restarts"
skill demo "a demo skill" v6 && commit c6
c6="$(git -C "$T/origin.git" rev-parse main)"
git -C "$HERMES_SKILLS_REPO_DIR" fetch -q --depth 1 --filter=blob:none origin main
git -C "$HERMES_SKILLS_REPO_DIR" checkout -q --detach FETCH_HEAD # what an interrupted run leaves behind
expect_eq "checkout is already at the new commit" "$(head_of)" "$c6"
pid_now="$(pid_of)"
"$SCRIPT" >/dev/null && ok "exits 0" || bad "exits 0"
[ "$(pid_of)" != "$pid_now" ] && ok "gateway was restarted anyway" || bad "gateway was restarted anyway"
expect_eq "marker records the deployed commit" "$(tr -d '[:space:]' <"$HERMES_SKILLS_REPO_DIR/.git/hermes-deployed-sha")" "$c6"
pid_now="$(pid_of)"
"$SCRIPT" | grep -q "nothing to do" && ok "and the run after that is a no-op" || bad "and the run after that is a no-op"
expect_eq "no further restart" "$(pid_of)" "$pid_now"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
