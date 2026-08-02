#!/bin/sh
if grep -lE '(TODO|FIXME|HACK)' "$@" 2>/dev/null; then
  echo "⚠️  Warning: TODO/FIXME/HACK comments found in the files above"
  echo "   Consider addressing these before committing"
fi
exit 0
