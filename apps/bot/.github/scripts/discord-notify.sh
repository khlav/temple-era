#!/bin/bash

# Discord PR Notification Script
# Handles PR descriptions safely for Discord webhooks

set -euo pipefail

# Configuration
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
MAX_DESCRIPTION_LENGTH=4000

# Check if webhook URL is provided
if [ -z "$WEBHOOK_URL" ]; then
    echo "Error: DISCORD_WEBHOOK_URL environment variable is not set"
    exit 1
fi

# Input parameters
PR_NUMBER="$1"
PR_TITLE="$2"
PR_DESCRIPTION="$3"
PR_URL="$4"
MERGED_AT="$5"

echo "Processing Discord notification for PR #$PR_NUMBER"

# Function to convert GitHub markdown to Discord format
convert_to_discord() {
    local input="$1"
    # Convert GitHub code blocks to Discord format
    # Triple backticks with language -> Discord code blocks
    input=$(echo "$input" | sed 's/```\([a-zA-Z]*\)/```\1/g')
    # Convert inline code (single backticks) - Discord uses the same format
    # No conversion needed for inline code
    echo "$input"
}

# Function to safely escape JSON strings
escape_json() {
    local input="$1"
    # Use jq to properly escape JSON if available, otherwise use basic escaping
    if command -v jq >/dev/null 2>&1; then
        echo "$input" | jq -R -s .
    else
        # Basic escaping fallback
        echo "$input" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\n/\\n/g' | sed 's/\r/\\r/g' | sed 's/\t/\\t/g'
    fi
}

# Function to truncate text safely
truncate_text() {
    local text="$1"
    local max_length="$2"
    
    if [ ${#text} -gt $max_length ]; then
        # Find the last space before the limit to avoid cutting words
        local truncated="${text:0:$max_length}"
        local last_space=$(echo "$truncated" | grep -o ' .*$' | wc -c)
        if [ $last_space -gt 0 ] && [ $last_space -lt 100 ]; then
            # Cut at the last space if it's not too far back
            truncated="${truncated:0:$((max_length - last_space))}"
        else
            # Just cut at the limit
            truncated="${truncated:0:$max_length}"
        fi
        echo "${truncated}..."
    else
        echo "$text"
    fi
}

# Process the description
if [ -z "$PR_DESCRIPTION" ] || [ "$(echo "$PR_DESCRIPTION" | tr -d '[:space:]')" = "" ]; then
    DESCRIPTION="No description provided"
else
    # Convert GitHub markdown to Discord format
    DESCRIPTION=$(convert_to_discord "$PR_DESCRIPTION")
    # Truncate if necessary
    DESCRIPTION=$(truncate_text "$DESCRIPTION" $MAX_DESCRIPTION_LENGTH)
fi

# Ensure title is not too long (Discord limit: 256 chars)
if [ ${#PR_TITLE} -gt 256 ]; then
    PR_TITLE="${PR_TITLE:0:253}..."
fi

# Escape the description for JSON
ESCAPED_DESCRIPTION=$(escape_json "$DESCRIPTION")
ESCAPED_TITLE=$(escape_json "$PR_TITLE")

# Remove quotes that jq adds if using jq
if command -v jq >/dev/null 2>&1; then
    ESCAPED_DESCRIPTION=$(echo "$ESCAPED_DESCRIPTION" | sed 's/^"//' | sed 's/"$//')
    ESCAPED_TITLE=$(echo "$ESCAPED_TITLE" | sed 's/^"//' | sed 's/"$//')
fi

# Create the JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "embeds": [
    {
      "title": "PR #$PR_NUMBER: $ESCAPED_TITLE",
      "description": "$ESCAPED_DESCRIPTION",
      "color": 5763719,
      "url": "$PR_URL",
      "footer": {
        "text": "Merged to main"
      }
    }
  ]
}
EOF
)

# Validate JSON before sending
if command -v jq >/dev/null 2>&1; then
    echo "$JSON_PAYLOAD" | jq . >/dev/null || {
        echo "Error: Generated JSON is invalid"
        exit 1
    }
fi

# Send to Discord
echo "Sending notification to Discord..."
HTTP_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$JSON_PAYLOAD" \
    "$WEBHOOK_URL")

# Extract HTTP status code
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

# Check response
if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 204 ]; then
    echo "Discord notification sent successfully"
else
    echo "Error: Discord webhook returned HTTP $HTTP_STATUS"
    echo "Response: $HTTP_RESPONSE"
    exit 1
fi
