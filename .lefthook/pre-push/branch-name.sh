#!/bin/sh
current_branch=$(git branch --show-current)
if [ -z "$current_branch" ]; then
  # Detached HEAD - no branch to validate
  exit 0
fi
if echo "$current_branch" | grep -qE '^(feature|fix|chore|refactor|hotfix|dev|claude)/(temple-[0-9]+|noticket)-.+'; then
  echo "✅ Branch name follows convention: $current_branch"
else
  echo "❌ Branch name does not follow convention: $current_branch"
  echo "   Expected format: {type}/{ticket-id}-{description}"
  echo "   Types: feature, fix, chore, refactor, hotfix, dev, claude"
  echo "   Ticket ID: a Plane TEMPLE ticket (e.g. temple-10), or 'noticket' if none"
  exit 1
fi
