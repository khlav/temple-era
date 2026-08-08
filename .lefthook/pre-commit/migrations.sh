#!/bin/sh
if [ -d "apps/web/drizzle" ] && git status --porcelain apps/web/drizzle/ | grep -q .; then
  echo "⚠️  Warning: Uncommitted database migrations detected"
  echo "   Consider running 'pnpm --filter temple-era-web db:generate' and committing migrations"
fi
exit 0
