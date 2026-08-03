#!/bin/sh
# Warn-only, staged-files-only secrets scan. semgrep is a Python tool and
# doesn't arrive via `pnpm install`, so this skips silently when it's absent
# rather than breaking the hook for contributors who haven't installed it.
if ! command -v semgrep >/dev/null 2>&1; then
  exit 0
fi
semgrep --config p/secrets --quiet --error "$@"
if [ $? -ne 0 ]; then
  echo "⚠️  Warning: semgrep found a possible secret in the files above"
  echo "   Review before committing - rotating a leaked credential is a lot more work than removing it now"
fi
exit 0
