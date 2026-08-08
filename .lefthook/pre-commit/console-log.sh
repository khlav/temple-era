#!/bin/sh
if grep -l 'console\.log' "$@" 2>/dev/null; then
  echo "⚠️  Warning: console.log found in the files above"
  echo "   Consider removing or replacing with the app's logger"
fi
exit 0
