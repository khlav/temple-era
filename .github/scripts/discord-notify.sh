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

# Input parameters (prefer environment variables, fallback to positional arguments for backward compatibility)
PR_NUMBER="${PR_NUMBER:-$1}"
PR_TITLE="${PR_TITLE:-$2}"
PR_DESCRIPTION="${PR_DESCRIPTION:-$3}"
PR_URL="${PR_URL:-$4}"
MERGED_AT="${MERGED_AT:-$5}"

# Which app the PR touched, used as the embed title prefix. The workflow derives
# this from the changed paths ("Website" / "Bot" / "Website + Bot" / "Repo").
# Defaults to "Website" to preserve pre-monorepo behaviour if unset.
PR_SCOPE="${PR_SCOPE:-Website}"

# "Repo PR #12" reads badly, and a repo-wide change has no app to name — so the
# prefix is dropped entirely there, giving plain "PR #12: title". App-specific
# scopes keep theirs, which is the whole point of having a prefix.
case "$PR_SCOPE" in
  Repo|"") TITLE_PREFIX="" ;;
  *)       TITLE_PREFIX="$PR_SCOPE " ;;
esac

echo "Processing Discord notification for ${TITLE_PREFIX}PR #$PR_NUMBER"

# Archon (PR-Agent) rewrites the PR body on every push: it wraps the original
# description under a "### **User description**" heading, then appends its own
# "### **PR Type**" / "### **Description**" sections followed by a raw-HTML
# "File Walkthrough" block meant for GitHub's renderer, not Discord's. Anchor on
# the "___" horizontal rule immediately preceding "### **PR Type**" specifically
# (not "the first hr") because a human-authored description could legitimately
# contain its own "___"/"---", and truncating on that alone would cut real
# content. "### **PR Type**" is Archon's fixed marker, so pairing the two is a
# reliable anchor for where Archon's appendix begins.
strip_archon_appendix() {
    awk '
        {
            lines[NR] = $0
            if ($0 ~ /^___[[:space:]]*$/) {
                last_hr = NR
            }
            if ($0 ~ /^### \*\*PR Type\*\*[[:space:]]*$/ && pr_type_line == 0) {
                pr_type_line = NR
                hr_line = last_hr
            }
        }
        END {
            limit = (pr_type_line > 0 && hr_line > 0) ? hr_line - 1 : NR
            # Trim trailing blank lines left over from the cut
            while (limit > 0 && lines[limit] ~ /^[[:space:]]*$/) {
                limit--
            }
            for (i = 1; i <= limit; i++) {
                print lines[i]
            }
        }
    '
}

# Archon also prepends a "### **User description**" heading directly above the
# original description before its own appended sections (stripped above). It's
# only ever the first line Archon has touched the PR at all, so this only fires
# when the heading is literally line 1 — a human-authored description that
# happens to contain that text further down is left alone.
strip_user_description_heading() {
    awk '
        NR == 1 && $0 ~ /^### \*\*User description\*\*[[:space:]]*$/ {
            heading_stripped = 1
            next
        }
        NR == 2 && heading_stripped == 1 && $0 ~ /^[[:space:]]*$/ {
            next
        }
        { print }
    '
}

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
    # Drop Archon's "User description" heading and its appended PR-Agent sections
    # (raw HTML included) before anything else
    DESCRIPTION=$(echo "$PR_DESCRIPTION" | strip_user_description_heading | strip_archon_appendix)
    # Convert GitHub markdown to Discord format
    DESCRIPTION=$(convert_to_discord "$DESCRIPTION")
    # Truncate if necessary
    DESCRIPTION=$(truncate_text "$DESCRIPTION" $MAX_DESCRIPTION_LENGTH)
fi

# Create the JSON payload robustly using jq if available
if command -v jq >/dev/null 2>&1; then
    JSON_PAYLOAD=$(jq -n \
        --arg number "$PR_NUMBER" \
        --arg title "${TITLE_PREFIX}PR #$PR_NUMBER: $PR_TITLE" \
        --arg desc "$DESCRIPTION" \
        --arg url "$PR_URL" \
        --arg timestamp "$MERGED_AT" \
        '{
          embeds: [
            {
              title: $title,
              description: $desc,
              color: 5763719,
              url: $url,
              footer: {
                text: "Merged to main"
              },
              timestamp: $timestamp
            }
          ]
        }')
else
    echo "Warning: jq not found, falling back to basic shell interpolation (less robust)"
    # Basic escaping fallback (original logic)
    escape_json() {
        local input="$1"
        echo "$input" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\n/\\n/g' | sed 's/\r/\\r/g' | sed 's/\t/\\t/g'
    }
    ESCAPED_DESCRIPTION=$(escape_json "$DESCRIPTION")
    ESCAPED_TITLE=$(escape_json "$PR_TITLE")
    
    JSON_PAYLOAD=$(cat <<EOF
{
  "embeds": [
    {
      "title": "${TITLE_PREFIX}PR #$PR_NUMBER: $ESCAPED_TITLE",
      "description": "$ESCAPED_DESCRIPTION",
      "color": 5763719,
      "url": "$PR_URL",
      "footer": {
        "text": "Merged to main"
      },
      "timestamp": "$MERGED_AT"
    }
  ]
}
EOF
)
fi

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