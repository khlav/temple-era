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

if echo "$commit_msg" | grep -qiE '(wip|work in progress|temp|temporary)'; then
  echo "⚠️  Warning: Commit message contains WIP/temporary language"
fi

echo "🎉 Commit message validation passed!"
