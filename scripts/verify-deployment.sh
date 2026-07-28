#!/usr/bin/env bash
#
# Phase 4 deployment gate. Run against a Vercel PREVIEW deployment before
# promoting to production, and again against production afterwards.
#
#   scripts/verify-deployment.sh https://<preview>.vercel.app
#
# Checks, in order of how badly you want to know:
#   1. Home page renders
#   2. /api/v1/openapi.json is byte-identical to the captured production
#      baseline  -> the external Templar bot codegens against this
#   3. An authenticated /api/v1/me call succeeds  -> THE TEMPLAR GATE
#
# Check 3 needs a real personal API token. Export it first; it is never
# written to disk or echoed:
#
#   export TEMPLE_API_TOKEN=tera_...
#
# Exit code is non-zero if any check fails. If check 2 or 3 fails, STOP —
# do not promote the deployment.

set -uo pipefail

BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
  echo "usage: $0 <base-url>" >&2
  exit 64
fi
BASE_URL="${BASE_URL%/}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="$REPO_ROOT/docs/baselines/openapi-v1-prod.json"

pass=0
fail=0
ok()   { echo "  ✅ $1"; pass=$((pass + 1)); }
bad()  { echo "  ❌ $1"; fail=$((fail + 1)); }

echo "Verifying: $BASE_URL"
echo

# ---------------------------------------------------------------- 1. home page
echo "1. Home page"
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL/" || echo 000)
if [ "$code" = "200" ]; then ok "GET / -> 200"; else bad "GET / -> $code (expected 200)"; fi
echo

# ------------------------------------------------------- 2. OpenAPI spec parity
echo "2. OpenAPI spec parity (Templar codegens against this)"
if [ ! -f "$BASELINE" ]; then
  bad "baseline missing at docs/baselines/openapi-v1-prod.json"
else
  # NOTE: the .json suffix is load-bearing — the diff below parses these with
  # node, and an extensionless temp file silently fails to parse, which turns
  # the "what changed?" output into a 60KB dump of the whole document.
  tmp=$(mktemp -t openapi).json
  code=$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 30 "$BASE_URL/api/v1/openapi.json" || echo 000)
  if [ "$code" != "200" ]; then
    bad "GET /api/v1/openapi.json -> $code (expected 200)"
  elif cmp -s "$BASELINE" "$tmp"; then
    ok "spec is byte-identical to the production baseline"
  else
    bad "spec DIFFERS from the production baseline"
    echo "     baseline: $(shasum -a 256 "$BASELINE" | cut -c1-16)…"
    echo "     received: $(shasum -a 256 "$tmp"      | cut -c1-16)…"
    echo
    echo "     Endpoints added/removed (the part Templar would notice):"
    node -e "
      const fs=require('fs');
      const rd=p=>JSON.parse(fs.readFileSync(p,'utf8'));
      const a=Object.keys(rd('$BASELINE').paths||{}).sort();
      const b=Object.keys(rd('$tmp').paths||{}).sort();
      const gone=a.filter(x=>!b.includes(x)), added=b.filter(x=>!a.includes(x));
      if(!gone.length && !added.length) console.log('       (none — the change is inside an existing path or schema)');
      gone.forEach(p=>console.log('       - REMOVED ' + p));
      added.forEach(p=>console.log('       + ADDED   ' + p));
    " 2>&1 | head -30
    echo
    echo "     Full structural diff (first 30 lines):"
    diff <(node -e "const fs=require('fs');console.log(JSON.stringify(JSON.parse(fs.readFileSync('$BASELINE','utf8')),null,1))") \
         <(node -e "const fs=require('fs');console.log(JSON.stringify(JSON.parse(fs.readFileSync('$tmp','utf8')),null,1))") \
      2>/dev/null | head -30 | cut -c1-140 | sed 's/^/       /'
  fi
  rm -f "$tmp"
fi
echo

# ------------------------------------------------------------ 3. Templar gate
echo "3. Authenticated /api/v1/me  (THE TEMPLAR GATE)"
if [ -z "${TEMPLE_API_TOKEN:-}" ]; then
  echo "  ⚠️  SKIPPED — TEMPLE_API_TOKEN not set."
  echo "     This is the check that proves external API auth still works."
  echo "     Do not promote without running it:  export TEMPLE_API_TOKEN=tera_..."
else
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
           -H "Authorization: Bearer $TEMPLE_API_TOKEN" \
           "$BASE_URL/api/v1/me" || echo 000)
  if [ "$code" = "200" ]; then
    ok "GET /api/v1/me -> 200 as $(node -e "
      try { const m=require('$body'); console.log(m.name ?? m.discordId ?? 'authenticated user'); }
      catch(e) { console.log('authenticated user'); }" 2>/dev/null)"
  else
    bad "GET /api/v1/me -> $code (expected 200) — TEMPLAR WOULD BREAK"
  fi
  rm -f "$body"
fi
echo

echo "─────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  echo "✅ $pass passed, 0 failed."
  exit 0
else
  echo "❌ $pass passed, $fail FAILED — do not promote this deployment."
  exit 1
fi
