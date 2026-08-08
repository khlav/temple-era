#!/bin/sh
echo "📝 Validating commit message..."

commit_msg=$(cat "$1")

if echo "$commit_msg" | grep -qE '^(feat|fix|chore|refactor|hotfix|dev)(\(.+\))?: .+'; then
  echo "✅ Commit message follows conventional commit format"
else
  echo "❌ Commit message does not follow conventional commit format"
  echo ""
  echo "Expected format: type(scope): description"
  echo "Types: feat, fix, chore, refactor, hotfix, dev"
  echo ""
  echo "Examples:"
  echo "  feat(search): add advanced filtering"
  echo "  fix(ui): resolve layout issue"
  echo "  chore(deps): update dependencies"
  echo ""
  echo "Your message: $commit_msg"
  exit 1
fi

# Subject line only. A body legitimately describes a temporary workaround or
# names a raid template; the subject is where a WIP marker actually appears.
commit_subject=$(printf '%s\n' "$commit_msg" | head -n 1)

# Word boundaries are load-bearing. Without them "temp" matched "TEMPLE" — and
# the branch convention requires a Plane TEMPLE ticket ID — so this warning
# fired on essentially every commit and taught everyone to ignore it. It also
# matched "Templar", "template" and "attempt" (TEMPLE-45).
#
# POSIX classes rather than \b: \b is a GNU extension and is not reliable in
# the BSD grep that ships with macOS, where these hooks mostly run.
if printf '%s' "$commit_subject" \
  | grep -qiE '(^|[^[:alnum:]])(wip|tmp|temp|temporary|work in progress|do not merge|dnm)([^[:alnum:]]|$)'; then
  echo "⚠️  Warning: Commit subject contains WIP/temporary language"
fi

echo "🎉 Commit message validation passed!"
