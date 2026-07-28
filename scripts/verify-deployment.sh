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
# Check 3 needs a real personal API token, supplied one of two ways:
#
#   1. Environment:  export TEMPLE_API_TOKEN=tera_...
#   2. Token file:   ~/.temple-era-token  (or $TEMPLE_API_TOKEN_FILE)
#
# Prefer the file. Shells here are one-shot, so an `export` in one command
# does not survive into the next, and putting the token on the command line
# leaks it into shell history and any transcript. Create the file once, from
# a private terminal, with a hidden prompt:
#
#   read -rs t && printf '%s' "$t" > ~/.temple-era-token \
#     && chmod 600 ~/.temple-era-token && unset t
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

# Vercel Deployment Protection is enabled for ALL previews on this project
# (ssoProtection: prod_deployment_urls_and_all_previews). Without a bypass
# secret, Vercel intercepts requests before they reach the app and every check
# fails for reasons that say nothing about the deployment.
#
# Generate one at Project Settings -> Deployment Protection -> Protection Bypass
# for Automation, then:
#
#   VERCEL_AUTOMATION_BYPASS_SECRET=... scripts/verify-deployment.sh <url>
#
# Do NOT disable protection to work around this.
BYPASS=()
if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
  BYPASS=(-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET")
  echo "(using Vercel protection bypass)"
fi

# Distinguish "Vercel blocked us" from "the app returned an error". Vercel's
# auth wall answers 401 with its own SSO markers, which would otherwise look
# identical to a genuine app-level 401 on /api/v1/me.
looks_like_vercel_wall() {
  grep -qiE 'vercel.com/sso|_vercel_sso_nonce|Authentication Required' "$1" 2>/dev/null
}

pass=0
fail=0
ok()   { echo "  ✅ $1"; pass=$((pass + 1)); }
bad()  { echo "  ❌ $1"; fail=$((fail + 1)); }

echo "Verifying: $BASE_URL"
echo

# ---------------------------------------------------------------- 1. home page
echo "1. Home page"
home=$(mktemp -t home).html
code=$(curl -sS -o "$home" -w '%{http_code}' --max-time 30 ${BYPASS[@]+"${BYPASS[@]}"} "$BASE_URL/" || echo 000)
if [ "$code" = "200" ]; then
  ok "GET / -> 200"
elif looks_like_vercel_wall "$home"; then
  bad "GET / -> $code — blocked by Vercel Deployment Protection, not the app."
  echo "     Set VERCEL_AUTOMATION_BYPASS_SECRET (see header comment). This says"
  echo "     nothing about whether the deployment is healthy."
else
  bad "GET / -> $code (expected 200)"
fi
rm -f "$home"
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
  code=$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 30 ${BYPASS[@]+"${BYPASS[@]}"} "$BASE_URL/api/v1/openapi.json" || echo 000)
  if [ "$code" != "200" ] && looks_like_vercel_wall "$tmp"; then
    bad "GET /api/v1/openapi.json -> $code — blocked by Vercel Deployment Protection"
    echo "     Set VERCEL_AUTOMATION_BYPASS_SECRET; this is not a spec problem."
  elif [ "$code" != "200" ]; then
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

# Fall back to a token file when the env var is unset OR empty. Empty matters:
# `TEMPLE_API_TOKEN="$UNSET_VAR" script.sh` sets it to "" rather than leaving
# it unset, which otherwise looks identical to supplying no token at all.
TOKEN="${TEMPLE_API_TOKEN:-}"
TOKEN_FILE="${TEMPLE_API_TOKEN_FILE:-$HOME/.temple-era-token}"
TOKEN_SRC="environment"
if [ -z "$TOKEN" ] && [ -r "$TOKEN_FILE" ]; then
  TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
  TOKEN_SRC="$TOKEN_FILE"
fi

if [ -z "$TOKEN" ]; then
  echo "  ⚠️  SKIPPED — no API token found."
  echo "     This is the check that proves external API auth still works;"
  echo "     a skipped Templar gate is NOT a passed one."
  echo
  echo "     Create the token file once, from a private terminal:"
  echo "       read -rs t && printf '%s' \"\$t\" > $TOKEN_FILE \\"
  echo "         && chmod 600 $TOKEN_FILE && unset t"
  echo "     Or set TEMPLE_API_TOKEN in the same command that runs this script."
else
  echo "  (token source: $TOKEN_SRC)"
  # .json suffix again load-bearing — see the note on $tmp above.
  body=$(mktemp -t me).json
  code=$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 ${BYPASS[@]+"${BYPASS[@]}"} \
           -H "Authorization: Bearer $TOKEN" \
           "$BASE_URL/api/v1/me" || echo 000)
  if [ "$code" = "200" ]; then
    who=$(node -e "
      const fs=require('fs');
      try {
        const m=JSON.parse(fs.readFileSync('$body','utf8'));
        const parts=[m.name ?? m.id ?? 'unknown'];
        if (m.character?.name) parts.push('char: '+m.character.name);
        console.log(parts.join(', '));
      } catch(e) { console.log('UNPARSEABLE RESPONSE'); }" 2>/dev/null)
    ok "GET /api/v1/me -> 200 as $who"
  elif looks_like_vercel_wall "$body"; then
    bad "GET /api/v1/me -> $code — blocked by Vercel Deployment Protection."
    echo "     THE TEMPLAR GATE DID NOT RUN. Set VERCEL_AUTOMATION_BYPASS_SECRET"
    echo "     and re-run; do not read this as a passed or failed auth check."
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
