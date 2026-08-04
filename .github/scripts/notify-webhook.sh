#!/bin/bash

# Generic webhook notifier. Event-agnostic on purpose — knows nothing about
# PRs, Plane, or any other system. Reads a JSON payload from stdin, POSTs it
# to WEBHOOK_URL with bearer auth, and fails loudly on a non-2xx response.
# Callers build whatever JSON shape they want (see pr-merged-webhook.yml for
# an example) and pipe it in; this script only handles delivery.

set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:-}"
WEBHOOK_TOKEN="${WEBHOOK_TOKEN:-}"

if [ -z "$WEBHOOK_URL" ]; then
    echo "Error: WEBHOOK_URL environment variable is not set"
    exit 1
fi

if [ -z "$WEBHOOK_TOKEN" ]; then
    echo "Error: WEBHOOK_TOKEN environment variable is not set"
    exit 1
fi

JSON_PAYLOAD="$(cat)"

if [ -z "$JSON_PAYLOAD" ]; then
    echo "Error: no payload provided on stdin"
    exit 1
fi

if command -v jq >/dev/null 2>&1; then
    echo "$JSON_PAYLOAD" | jq . >/dev/null || {
        echo "Error: payload on stdin is not valid JSON"
        exit 1
    }
fi

echo "Posting payload to webhook..."
HTTP_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $WEBHOOK_TOKEN" \
    -X POST \
    -d "$JSON_PAYLOAD" \
    "$WEBHOOK_URL")

HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed -e 's/HTTPSTATUS:[0-9]*$//')

if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
    echo "Webhook notified successfully (HTTP $HTTP_STATUS)"
else
    echo "Error: webhook returned HTTP $HTTP_STATUS"
    echo "Response: $HTTP_BODY"
    exit 1
fi
