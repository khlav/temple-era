#!/bin/sh
echo "📝 Preparing commit message..."

current_branch=$(git branch --show-current)

if echo "$current_branch" | grep -q "^feature/"; then
  commit_type="feat"
elif echo "$current_branch" | grep -q "^fix/"; then
  commit_type="fix"
elif echo "$current_branch" | grep -q "^chore/"; then
  commit_type="chore"
elif echo "$current_branch" | grep -q "^refactor/"; then
  commit_type="refactor"
elif echo "$current_branch" | grep -q "^hotfix/"; then
  commit_type="hotfix"
elif echo "$current_branch" | grep -q "^dev/"; then
  commit_type="dev"
else
  commit_type=""
fi

if [ -n "$commit_type" ] && [ -z "$(cat "$1")" ]; then
  description=$(echo "$current_branch" | sed "s/^[^/]*\///" | sed "s/-/ /g")
  suggested_msg="$commit_type: $description"
  echo "$suggested_msg" > "$1"
  echo "💡 Suggested commit message: $suggested_msg"
fi

echo "✅ Commit message prepared"
